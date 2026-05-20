import { getPreviewString, saveTtsProviderSettings } from '../../tts/index.js';
import { LocalTtsServerApi } from './api.js';
import { buildVoiceOptions, parseFallbackVoices, voiceIdOf } from './selectors.js';
import { mergeSettings } from './settings.js';
import { renderSettingsHtml } from './template.js';
import { readFormValues } from './form.js';

const FIELD_IDS = {
    provider_endpoint: 'local_tts_server_endpoint',
    model: 'local_tts_server_model',
    response_format: 'local_tts_server_format',
    selector_mode: 'local_tts_server_selector_mode',
    fallback_voices: 'local_tts_server_fallback_voices',
    speed: 'local_tts_server_speed',
    exaggeration: 'local_tts_server_exaggeration',
    temperature: 'local_tts_server_temperature',
    seed: 'local_tts_server_seed',
    timeout_ms: 'local_tts_server_timeout_ms',
    paralinguistic_tags: 'local_tts_server_paralinguistic_tags',
    semantic_tags: 'local_tts_server_semantic_tags',
};

export class LocalTtsServerProvider {
    settings;
    voices = [];
    status = null;
    separator = ' . ';
    audioElement = document.createElement('audio');
    previewBlobUrl = null;

    constructor() {
        this.settings = mergeSettings();
        this.api = new LocalTtsServerApi(() => this.settings);
    }

    get settingsHtml() {
        return renderSettingsHtml();
    }

    async loadSettings(settings) {
        this.settings = mergeSettings(settings);
        this.api = new LocalTtsServerApi(() => this.settings);

        for (const [field, id] of Object.entries(FIELD_IDS)) {
            const $el = $(`#${id}`);
            if (!$el.length) continue;
            $el.val(this.settings[field]);
            const event = ($el.is('select') || $el.is('input[type="checkbox"]')) ? 'change' : 'input';
            $el.on(event, () => this.onSettingsChange());
        }
        $('#local_tts_server_speed_output').text(this.settings.speed);
        $('#local_tts_server_snapshot_fallback').on('click', () => this.snapshotDiscoveredFallback());

        await this.checkReady();
    }

    onSettingsChange() {
        const values = readFormValues((field) => $(`#${FIELD_IDS[field]}`).val());
        Object.assign(this.settings, values);
        $('#local_tts_server_speed_output').text(this.settings.speed);
        saveTtsProviderSettings();
    }

    snapshotDiscoveredFallback() {
        if (!this.voices.length) {
            this.setStatus('No discovered voices to snapshot yet. Click Reload first.', false);
            return;
        }
        const csv = this.voices.map(voiceIdOf).filter(Boolean).join(',');
        $(`#${FIELD_IDS.fallback_voices}`).val(csv);
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
            this.status = await this.api.status();
            this.voices = await this.fetchTtsVoiceObjects();
            const engine = this.status.engine || this.status.model || 'unknown engine';
            const modelStatus = this.status.model_status || this.status.state || 'unknown state';
            this.setStatus(`${engine}: ${modelStatus}. ${this.voices.length} voices available.`, true);
        } catch (error) {
            this.voices = parseFallbackVoices(this.settings.fallback_voices);
            this.setStatus(`Server check failed: ${error.message}`, false);
        }
    }

    async onRefreshClick() {
        await this.checkReady();
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

    // voiceMapKey is part of SillyTavern's provider contract but not needed for
    // this server — the composite "voice+preset" selector already encodes everything.
    async generateTts(text, voiceId, voiceMapKey) {
        void voiceMapKey;
        return this.api.generate(text, voiceId);
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

        const response = await this.api.generate(getPreviewString('en-US'), voiceId);
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
    }
}
