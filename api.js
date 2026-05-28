import { normalizeEndpoint, speechEndpoint, streamEndpoint } from './selectors.js';
import { DEFAULT_TIMEOUT_MS, DEFAULT_GENERATION_TIMEOUT_MS } from './settings.js';

export class LocalTtsServerApi {
    constructor(getSettings, fetchImpl, webSocketImpl) {
        this.getSettings = getSettings;
        // Wrap in an arrow so `this.fetchImpl(...)` doesn't bind the api
        // instance as the receiver — browser `fetch` requires `this === window`
        // and throws "Illegal invocation" otherwise.
        const impl = fetchImpl ?? ((...args) => fetch(...args));
        this.fetchImpl = (...args) => impl(...args);
        this.webSocketImpl = webSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : null);
    }

    baseUrl() {
        return normalizeEndpoint(this.getSettings().provider_endpoint);
    }

    discoveryTimeoutMs() {
        const value = Number(this.getSettings().timeout_ms);
        return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_TIMEOUT_MS;
    }

    generationTimeoutMs() {
        const value = Number(this.getSettings().generation_timeout_ms);
        return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_GENERATION_TIMEOUT_MS;
    }

    async fetchWithTimeout(url, init = {}, timeoutMs) {
        const controller = new AbortController();
        const limit = Number.isFinite(timeoutMs) ? timeoutMs : this.discoveryTimeoutMs();
        const timer = setTimeout(() => controller.abort(), limit);
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

    async switchEngine(engineId) {
        const response = await this.fetchWithTimeout(
            `${this.baseUrl()}/api/engine`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ engine: engineId }),
            },
            this.generationTimeoutMs(),
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json();
    }

    async generate(requestBody) {
        const settings = this.getSettings();
        const response = await this.fetchWithTimeout(
            speechEndpoint(settings.provider_endpoint),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            },
            this.generationTimeoutMs(),
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return response;
    }

    // Generate over the WebSocket. The socket's heartbeat resets an *idle*
    // timer on every frame, so a long generation is never killed by a single
    // total-time deadline (the failure mode of the fetch path). Binary frames
    // are assembled into a Blob and returned as a Response so the SillyTavern
    // provider contract (`response.blob()`) is preserved.
    async generateViaWebSocket(requestBody) {
        const WebSocketImpl = this.webSocketImpl;
        if (!WebSocketImpl) {
            throw new Error('WebSocket is not available');
        }
        const settings = this.getSettings();
        const url = streamEndpoint(settings.provider_endpoint);
        const idleLimit = this.generationTimeoutMs();
        const contentType = (requestBody.response_format || 'mp3') === 'wav' ? 'audio/wav' : 'audio/mpeg';

        return await new Promise((resolve, reject) => {
            const socket = new WebSocketImpl(url);
            try { socket.binaryType = 'arraybuffer'; } catch (error) { /* node ws lacks the setter */ }
            const chunks = [];
            let settled = false;
            let idleTimer = null;
            const requestId = `st-${Date.now()}`;

            const clearIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; };
            const armIdle = () => {
                clearIdle();
                idleTimer = setTimeout(() => fail(new Error('WebSocket idle timeout')), idleLimit);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                clearIdle();
                try { socket.close(); } catch (err) { /* already closing */ }
                reject(error);
            };
            const succeed = (value) => {
                if (settled) return;
                settled = true;
                clearIdle();
                try { socket.close(); } catch (err) { /* already closing */ }
                resolve(value);
            };

            socket.onopen = () => {
                armIdle();
                socket.send(JSON.stringify({ type: 'generate', id: requestId, request: requestBody }));
            };
            socket.onerror = () => fail(new Error('WebSocket error'));
            socket.onclose = () => fail(new Error('WebSocket closed before completion'));
            socket.onmessage = (event) => {
                armIdle(); // any frame, including a heartbeat ping, keeps us alive
                const data = event.data;
                if (typeof data !== 'string') {
                    chunks.push(data);
                    return;
                }
                let frame;
                try { frame = JSON.parse(data); } catch (error) { return; }
                if (frame.type === 'error') {
                    fail(new Error(`${frame.code}: ${frame.detail}`));
                    return;
                }
                if (frame.type === 'done') {
                    succeed(audioResponse(new Blob(chunks, { type: contentType }), contentType));
                }
            };
        });
    }
}

function audioResponse(blob, contentType) {
    // Minimal Response-shaped object: enough for the provider's blob()/headers
    // usage, without depending on a global Response constructor.
    return {
        ok: true,
        status: 200,
        blob: async () => blob,
        arrayBuffer: async () => blob.arrayBuffer(),
        text: async () => '',
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    };
}
