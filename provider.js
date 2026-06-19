import { getPreviewString, saveTtsProviderSettings } from '../../tts/index.js';
import { LocalTtsServerApi } from './api.js';
import {
    DEFAULT_ENDPOINT,
    DEFAULT_MODEL,
    buildVoiceOptions,
    parseFallbackVoices,
    voiceIdOf,
} from './selectors.js';
import { mergeSettings, DEFAULT_TIMEOUT_MS, DEFAULT_GENERATION_TIMEOUT_MS } from './settings.js';
import {
    renderSettingsHtml,
    readSchemaValues,
    buildSpeechRequest,
    schemaParams,
} from './schema.js';

const ROOT_ID = 'local_tts_server_root';

const ENVELOPE_IDS = {
    provider_endpoint:      'local_tts_server_endpoint',
    model:                  'local_tts_server_engine',
    response_format:        'local_tts_server_format',
    selector_mode:          'local_tts_server_selector_mode',
    fallback_voices:        'local_tts_server_fallback_voices',
    timeout_ms:             'local_tts_server_timeout_ms',
    generation_timeout_ms:  'local_tts_server_generation_timeout_ms',
};

export class LocalTtsServerProvider {
    settings;
    voices = [];
    status = null;
    // '\x00' never appears in chat text, so ST hands us the full message as one
    // generateTts() call. We split it ourselves and pipeline the generations so
    // playback is seamless (no inter-chunk gap while waiting for synthesis).
    separator = '\x00';
    audioElement = document.createElement('audio');
    previewBlobUrl = null;
    globalCaps = null;
    engineCap = null;

    constructor() {
        this.settings = mergeSettings();
        this.api = new LocalTtsServerApi(() => this.settings);
    }

    get settingsHtml() {
        // SillyTavern reads this once and inserts it. The actual schema-driven
        // panel is rendered into this container by loadSettings() after the
        // capability fetch resolves.
        return `<div id="${ROOT_ID}" class="tts-server-provider-settings"></div>`;
    }

    loadSettings(settings) {
        this.settings = mergeSettings(settings);
        // Don't recreate this.api — it already reads settings via () => this.settings.
        // If the endpoint URL changed, _getOrOpenSocket() detects the mismatch and reconnects.

        const root = $(`#${ROOT_ID}`);
        root.html('<div class="tts-server-provider-status">Loading capabilities…</div>');

        // Fire-and-forget: don't block ST's provider selection on our network round-trips.
        // generateTts is safe to call before caps arrive — buildSpeechRequest degrades
        // gracefully (no engine params, HTTP fallback instead of WS) until caps load.
        this.refreshCapabilitiesAndRender();
    }

    async refreshCapabilitiesAndRender() {
        try {
            this.globalCaps = await this.api.capabilities();
            // ALWAYS sync to the server's active engine. Persisted settings
            // from older sessions may still reference a different engine
            // (e.g. the old chatterbox-turbo default) but the server rejects
            // any model that doesn't match its currently-running engine.
            const activeEngine = this.globalCaps.current_engine || DEFAULT_MODEL;
            if (this.settings.model !== activeEngine) {
                this.settings.model = activeEngine;
                saveTtsProviderSettings();
            }
            this.engineCap = await this.api.engineCapability(this.settings.model);
        } catch (error) {
            this.renderFallbackShell();
            this.setStatus(`Capability fetch failed: ${error.message}`, false);
            return;
        }

        $(`#${ROOT_ID}`).html(renderSettingsHtml(this.globalCaps, this.engineCap));
        this.populateFields();
        this.bindHandlers();
        await this.checkReady();
    }

    renderFallbackShell() {
        $(`#${ROOT_ID}`).html(
            `<label for="${ENVELOPE_IDS.provider_endpoint}">Server base URL</label>` +
            `<input id="${ENVELOPE_IDS.provider_endpoint}" type="text" class="text_pole" maxlength="500">` +
            `<div id="local_tts_server_status" class="tts-server-provider-status">Capabilities unavailable</div>`,
        );
        $(`#${ENVELOPE_IDS.provider_endpoint}`).val(this.settings.provider_endpoint || DEFAULT_ENDPOINT)
            .on('input', () => {
                this.settings.provider_endpoint = String($(`#${ENVELOPE_IDS.provider_endpoint}`).val() || '').trim();
                saveTtsProviderSettings();
            });
    }

    populateFields() {
        for (const [field, id] of Object.entries(ENVELOPE_IDS)) {
            $(`#${id}`).val(this.settings[field] ?? '');
        }
        for (const param of this.allSchemaParams()) {
            const stored = this.settings[param.id];
            // Pre-populate from the effective server default (param.default,
            // which the server has already overlaid with any admin override)
            // when the user hasn't stored an explicit value. The form is then
            // a real preview of what will be sent. Clearing a field still
            // means "server default" — onSettingsChange writes the blank back,
            // populateFields then re-fills with the current default next render.
            let display;
            if (stored !== undefined && stored !== null && stored !== '') {
                display = String(stored);
            } else if (param.type === 'tristate') {
                display = 'default';
            } else if (param.default !== undefined && param.default !== null && param.default !== '') {
                display = String(param.default);
            } else {
                display = '';
            }
            $(`[data-param="${param.id}"]`).val(display);
        }
    }

    allSchemaParams() {
        return schemaParams(this.globalCaps, this.engineCap);
    }

    bindHandlers() {
        for (const [field, id] of Object.entries(ENVELOPE_IDS)) {
            const $el = $(`#${id}`);
            const event = $el.is('select') ? 'change' : 'input';
            $el.on(event, () => this.onSettingsChange());
        }
        $('#local_tts_server_engine').on('change', async () => {
            // Switch the server's active engine live (one engine at a time), then
            // re-render so the panel reflects the new engine's capabilities.
            const selected = String($('#local_tts_server_engine').val() || '');
            if (!selected || selected === this.settings.model) return;
            this.setStatus(`Switching engine to ${selected}…`);
            try {
                await this.api.switchEngine(selected);
                await this.refreshCapabilitiesAndRender();
            } catch (error) {
                $('#local_tts_server_engine').val(this.settings.model);
                this.setStatus(`Engine switch failed: ${error.message}`, false);
            }
        });
        for (const param of this.allSchemaParams()) {
            const $el = $(`[data-param="${param.id}"]`);
            const event = $el.is('select') ? 'change' : 'input';
            $el.on(event, () => this.onSettingsChange());
        }
        $('#local_tts_server_snapshot_fallback').on('click', () => this.snapshotDiscoveredFallback());
    }

    onSettingsChange() {
        for (const [field, id] of Object.entries(ENVELOPE_IDS)) {
            const raw = $(`#${id}`).val();
            if (field === 'timeout_ms') {
                this.settings[field] = this.parseTimeout(raw, DEFAULT_TIMEOUT_MS);
            } else if (field === 'generation_timeout_ms') {
                this.settings[field] = this.parseTimeout(raw, DEFAULT_GENERATION_TIMEOUT_MS);
            } else {
                this.settings[field] = String(raw ?? '').trim();
            }
        }
        for (const param of this.allSchemaParams()) {
            const raw = $(`[data-param="${param.id}"]`).val();
            this.settings[param.id] = raw ?? '';
        }
        saveTtsProviderSettings();
    }

    parseTimeout(raw, fallback) {
        const n = Number(raw);
        return Number.isFinite(n) && n >= 1000 ? n : fallback;
    }

    snapshotDiscoveredFallback() {
        if (!this.voices.length) {
            this.setStatus('No discovered voices to snapshot yet. Click Reload first.', false);
            return;
        }
        const csv = this.voices.map(voiceIdOf).filter(Boolean).join(',');
        $(`#${ENVELOPE_IDS.fallback_voices}`).val(csv);
        this.settings.fallback_voices = csv;
        saveTtsProviderSettings();
        this.setStatus(`Saved ${this.voices.length} voices to the fallback list.`, true);
    }

    setStatus(message, success) {
        const status = $('#local_tts_server_status');
        status.text(message);
        status.toggleClass('success', Boolean(success));
        status.toggleClass('error', !success);
    }

    async checkReady() {
        this.setStatus('Checking server…');
        try {
            [this.status, this.voices] = await Promise.all([
                this.api.status(),
                this.fetchTtsVoiceObjects(),
            ]);
            const engine = this.status.engine || 'unknown engine';
            const modelStatus = this.status.model_status || this.status.state || 'unknown state';
            this.setStatus(`${engine}: ${modelStatus}. ${this.voices.length} voices available.`, true);
        } catch (error) {
            this.voices = parseFallbackVoices(this.settings.fallback_voices);
            this.setStatus(`Server check failed: ${error.message}`, false);
        }
    }

    async onRefreshClick() {
        await this.refreshCapabilitiesAndRender();
    }

    async fetchTtsVoiceObjects() {
        try {
            const [voices, presets] = await Promise.all([this.api.voices(), this.api.presets()]);
            const discovered = buildVoiceOptions(voices, presets, this.settings.selector_mode);
            this.voices = discovered.length ? discovered : parseFallbackVoices(this.settings.fallback_voices);
        } catch (error) {
            this.voices = parseFallbackVoices(this.settings.fallback_voices);
            this.setStatus(`Discovery failed: ${error.message}`, false);
        }
        return this.voices;
    }

    async getVoice(voiceName) {
        if (!this.voices.length) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.find(voice => voice.name === voiceName || voice.voice_id === voiceName);
        if (!match) {
            throw new Error(`TTS voice ${voiceName} not found`);
        }
        return match;
    }

    buildRequestBody(text, voiceId) {
        const schemaValues = readSchemaValues(
            (id) => $(`[data-param="${id}"]`).val(),
            this.globalCaps,
            this.engineCap,
        );
        return buildSpeechRequest({
            engineId: this.settings.model || DEFAULT_MODEL,
            response_format: this.settings.response_format || 'mp3',
            input: text,
            voice: voiceId,
            values: schemaValues,
            engineCapability: this.engineCap,
            globalCapabilities: this.globalCaps,
        });
    }

    // Prefer the WebSocket channel when the server advertises it (keep-alive +
    // progress, immune to the fetch total-timeout). Any WS failure falls back to
    // the HTTP POST so generation still works against older servers or flaky WS.
    async generateRequest(requestBody) {
        if (this.globalCaps?.transport?.websocket) {
            try {
                return await this.api.generateViaWebSocket(requestBody);
            } catch (error) {
                console.warn(`[tts-server] WebSocket generation failed, falling back to HTTP: ${error?.message}`);
            }
        }
        return this.api.generate(requestBody);
    }

    // Split message text into synthesis chunks on paragraph or line boundaries.
    // Double newlines are tried first so short-line prose stays together.
    _splitChunks(text) {
        const s = String(text || '').trim();
        if (!s) return [];
        for (const re of [/\n\n+/, /\n/]) {
            const parts = s.split(re).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) return parts;
        }
        return [s];
    }

    // voiceMapKey is part of SillyTavern's provider contract but the composite
    // "voice+preset" selector already encodes everything the server needs.
    // With separator='\x00' ST passes the full message here. We split it,
    // generate each chunk sequentially over the persistent WebSocket, then
    // return the concatenated audio so ST plays it as one uninterrupted clip.
    async generateTts(text, voiceId, voiceMapKey) {
        void voiceMapKey;
        const chunks = this._splitChunks(text);

        if (chunks.length <= 1) {
            return this.generateRequest(this.buildRequestBody(chunks[0] ?? text, voiceId));
        }

        let contentType = 'audio/mpeg';
        const blobs = [];
        for (const chunk of chunks) {
            const response = await this.generateRequest(this.buildRequestBody(chunk, voiceId));
            if (!blobs.length) {
                contentType = response.headers?.get('content-type') ?? contentType;
            }
            blobs.push(await response.blob());
        }

        const combined = new Blob(blobs, { type: contentType });
        return {
            ok: true,
            status: 200,
            blob: async () => combined,
            arrayBuffer: async () => combined.arrayBuffer(),
            text: async () => '',
            headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? contentType : null },
        };
    }

    revokePreviewUrl() {
        if (this.previewBlobUrl) {
            URL.revokeObjectURL(this.previewBlobUrl);
            this.previewBlobUrl = null;
        }
    }

    async previewTtsVoice(voiceId) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.revokePreviewUrl();

        const response = await this.generateRequest(this.buildRequestBody(getPreviewString('en-US'), voiceId));
        const blob = await response.blob();
        this.previewBlobUrl = URL.createObjectURL(blob);
        this.audioElement.src = this.previewBlobUrl;
        this.audioElement.onended = () => this.revokePreviewUrl();
        await this.audioElement.play();
    }

    dispose() {
        this.audioElement.pause();
        this.audioElement.src = '';
        this.revokePreviewUrl();
        this.api.closeSocket();
    }
}
