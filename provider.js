import { getPreviewString, saveTtsProviderSettings } from '../../tts/index.js';
import { LocalTtsServerApi } from './api.js';
import { buildVoiceOptions, parseFallbackVoices } from './selectors.js';
import { mergeSettings } from './settings.js';

export class LocalTtsServerProvider {
    settings;
    voices = [];
    status = null;
    separator = ' . ';
    audioElement = document.createElement('audio');

    constructor() {
        this.settings = mergeSettings();
        this.api = new LocalTtsServerApi(() => this.settings);
    }

    get settingsHtml() {
        return `
        <div class="tts-server-provider-settings">
            <h4 class="textAlignCenter">Local TTS Server</h4>

            <label for="local_tts_server_endpoint">Server base URL</label>
            <input id="local_tts_server_endpoint" type="text" class="text_pole" maxlength="500" value="${this.settings.provider_endpoint}">

            <div class="tts-server-provider-grid">
                <label for="local_tts_server_model">Model</label>
                <input id="local_tts_server_model" type="text" class="text_pole" maxlength="200" value="${this.settings.model}">

                <label for="local_tts_server_format">Format</label>
                <select id="local_tts_server_format" class="text_pole">
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                </select>

                <label for="local_tts_server_selector_mode">Voice list</label>
                <select id="local_tts_server_selector_mode" class="text_pole">
                    <option value="plain-plus-presets">Voices and voice+preset selectors</option>
                    <option value="plain-only">Voices only</option>
                    <option value="presets-only">Voice+preset selectors only</option>
                </select>
            </div>

            <label for="local_tts_server_fallback_voices">Fallback voices</label>
            <input id="local_tts_server_fallback_voices" type="text" class="text_pole" placeholder="alice,alice+calm" value="${this.settings.fallback_voices}">

            <div class="tts-server-provider-grid">
                <label for="local_tts_server_speed">Speed <span id="local_tts_server_speed_output">${this.settings.speed}</span></label>
                <input id="local_tts_server_speed" type="range" min="0.25" max="4" step="0.05" value="${this.settings.speed}">

                <label for="local_tts_server_exaggeration">Exaggeration</label>
                <input id="local_tts_server_exaggeration" type="number" class="text_pole" min="0" max="2" step="0.05" value="${this.settings.exaggeration}">

                <label for="local_tts_server_temperature">Temperature</label>
                <input id="local_tts_server_temperature" type="number" class="text_pole" min="0" max="2" step="0.05" value="${this.settings.temperature}">

                <label for="local_tts_server_seed">Seed</label>
                <input id="local_tts_server_seed" type="number" class="text_pole" step="1" value="${this.settings.seed}">
            </div>

            <label class="checkbox_label" for="local_tts_server_paralinguistic_tags">
                <input id="local_tts_server_paralinguistic_tags" type="checkbox">
                <small>Paralinguistic tag transforms</small>
            </label>

            <label class="checkbox_label" for="local_tts_server_semantic_tags">
                <input id="local_tts_server_semantic_tags" type="checkbox">
                <small>Semantic tag planning</small>
            </label>

            <div id="local_tts_server_status" class="tts-server-provider-status">Not checked</div>
        </div>`;
    }

    async loadSettings(settings) {
        this.settings = mergeSettings(settings);
        this.api = new LocalTtsServerApi(() => this.settings);

        $('#local_tts_server_endpoint').val(this.settings.provider_endpoint).on('input', () => this.onSettingsChange());
        $('#local_tts_server_model').val(this.settings.model).on('input', () => this.onSettingsChange());
        $('#local_tts_server_format').val(this.settings.response_format).on('change', () => this.onSettingsChange());
        $('#local_tts_server_selector_mode').val(this.settings.selector_mode).on('change', () => this.onSettingsChange());
        $('#local_tts_server_fallback_voices').val(this.settings.fallback_voices).on('input', () => this.onSettingsChange());
        $('#local_tts_server_speed').val(this.settings.speed).on('input', () => this.onSettingsChange());
        $('#local_tts_server_exaggeration').val(this.settings.exaggeration).on('input', () => this.onSettingsChange());
        $('#local_tts_server_temperature').val(this.settings.temperature).on('input', () => this.onSettingsChange());
        $('#local_tts_server_seed').val(this.settings.seed).on('input', () => this.onSettingsChange());
        $('#local_tts_server_paralinguistic_tags').prop('checked', this.settings.paralinguistic_tags).on('change', () => this.onSettingsChange());
        $('#local_tts_server_semantic_tags').prop('checked', this.settings.semantic_tags).on('change', () => this.onSettingsChange());
        $('#local_tts_server_speed_output').text(this.settings.speed);

        await this.checkReady();
    }

    onSettingsChange() {
        this.settings.provider_endpoint = String($('#local_tts_server_endpoint').val());
        this.settings.model = String($('#local_tts_server_model').val());
        this.settings.response_format = String($('#local_tts_server_format').val());
        this.settings.selector_mode = String($('#local_tts_server_selector_mode').val());
        this.settings.fallback_voices = String($('#local_tts_server_fallback_voices').val());
        this.settings.speed = Number($('#local_tts_server_speed').val());
        this.settings.exaggeration = String($('#local_tts_server_exaggeration').val());
        this.settings.temperature = String($('#local_tts_server_temperature').val());
        this.settings.seed = Number($('#local_tts_server_seed').val());
        this.settings.paralinguistic_tags = $('#local_tts_server_paralinguistic_tags').is(':checked');
        this.settings.semantic_tags = $('#local_tts_server_semantic_tags').is(':checked');
        $('#local_tts_server_speed_output').text(this.settings.speed);
        saveTtsProviderSettings();
    }

    setStatus(message, success) {
        const status = $('#local_tts_server_status');
        status.text(message);
        status.toggleClass('success', Boolean(success));
        status.toggleClass('error', !success);
    }

    async checkReady() {
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

    async generateTts(text, voiceId) {
        return this.api.generate(text, voiceId);
    }

    async previewTtsVoice(voiceId) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;

        const response = await this.api.generate(getPreviewString('en-US'), voiceId);
        const audio = await response.blob();
        const url = URL.createObjectURL(audio);
        this.audioElement.src = url;
        this.audioElement.play();
        this.audioElement.onended = () => URL.revokeObjectURL(url);
    }

    dispose() {
        this.audioElement.pause();
        this.audioElement.src = '';
    }
}
