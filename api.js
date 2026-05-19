import { buildSpeechRequest, normalizeEndpoint, speechEndpoint } from './selectors.js';

export class LocalTtsServerApi {
    constructor(getSettings, fetchImpl = fetch) {
        this.getSettings = getSettings;
        this.fetchImpl = fetchImpl;
    }

    baseUrl() {
        return normalizeEndpoint(this.getSettings().provider_endpoint);
    }

    async getJson(path) {
        const response = await this.fetchImpl(`${this.baseUrl()}${path}`, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json();
    }

    async status() {
        return this.getJson('/status');
    }

    async voices() {
        const voices = await this.getJson('/api/voices');
        return Array.isArray(voices) ? voices : [];
    }

    async presets() {
        const presets = await this.getJson('/api/presets');
        return Array.isArray(presets) ? presets : [];
    }

    async generate(input, voiceId, overrides = {}) {
        const settings = this.getSettings();
        const response = await this.fetchImpl(speechEndpoint(settings.provider_endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSpeechRequest(settings, input, voiceId, overrides)),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return response;
    }
}
