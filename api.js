import { normalizeEndpoint, speechEndpoint } from './selectors.js';
import { DEFAULT_TIMEOUT_MS } from './settings.js';

export class LocalTtsServerApi {
    constructor(getSettings, fetchImpl) {
        this.getSettings = getSettings;
        // Wrap in an arrow so `this.fetchImpl(...)` doesn't bind the api
        // instance as the receiver — browser `fetch` requires `this === window`
        // and throws "Illegal invocation" otherwise.
        const impl = fetchImpl ?? ((...args) => fetch(...args));
        this.fetchImpl = (...args) => impl(...args);
    }

    baseUrl() {
        return normalizeEndpoint(this.getSettings().provider_endpoint);
    }

    timeoutMs() {
        const value = Number(this.getSettings().timeout_ms);
        return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_TIMEOUT_MS;
    }

    async fetchWithTimeout(url, init = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs());
        try {
            return await this.fetchImpl(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async getJson(path) {
        const response = await this.fetchWithTimeout(`${this.baseUrl()}${path}`, { method: 'GET' });
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

    async capabilities() {
        return this.getJson('/api/capabilities');
    }

    async engineCapability(engineId) {
        if (!engineId) return null;
        const response = await this.fetchWithTimeout(
            `${this.baseUrl()}/api/capabilities/${encodeURIComponent(engineId)}`,
            { method: 'GET' },
        );
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        return response.json();
    }

    async generate(requestBody) {
        const settings = this.getSettings();
        const response = await this.fetchWithTimeout(speechEndpoint(settings.provider_endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return response;
    }
}
