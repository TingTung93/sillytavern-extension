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
        // Persistent WebSocket — reused across generateViaWebSocket() calls to
        // eliminate the per-chunk TCP+WS handshake that causes inter-chunk gaps.
        this._ws = null;        // open (or opening) WebSocket | null
        this._wsUrl = null;     // URL the socket was opened against
        this._activeReq = null; // { onMessage, settle } for the in-flight request
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

    // Close and discard the persistent socket. Called by provider.dispose() and
    // whenever the socket is no longer valid.
    closeSocket() {
        const ws = this._ws;
        if (!ws) return;
        this._ws = null;
        this._wsUrl = null;
        try { ws.close(); } catch (e) { /* already closing */ }
    }

    // Central handler for unexpected socket death (error or close after open).
    // Fails any in-flight request so the provider can fall back to HTTP.
    _onSocketDied(ws, err) {
        if (this._ws === ws) {
            this._ws = null;
            this._wsUrl = null;
        }
        if (err && this._activeReq) {
            this._activeReq.settle(err);
            this._activeReq = null;
        }
    }

    // Open a fresh WebSocket to `url`, store it as the persistent socket, and
    // return a Promise that resolves once the socket reaches OPEN state.
    _openNewSocket(url) {
        const WS = this.webSocketImpl;
        const ws = new WS(url);
        this._ws = ws;
        this._wsUrl = url;
        try { ws.binaryType = 'arraybuffer'; } catch (e) { /* node ws lacks the setter */ }

        return new Promise((resolve, reject) => {
            ws.onopen = () => {
                // Replace connect-phase handlers with lifetime handlers.
                ws.onmessage = (event) => { this._activeReq?.onMessage(event.data); };
                ws.onerror = () => this._onSocketDied(ws, new Error('WebSocket error'));
                ws.onclose = () => this._onSocketDied(ws, new Error('WebSocket closed unexpectedly'));
                resolve(ws);
            };
            ws.onerror = () => { this._onSocketDied(ws, null); reject(new Error('WebSocket error')); };
            ws.onclose = () => { this._onSocketDied(ws, null); reject(new Error('WebSocket closed before connecting')); };
        });
    }

    // Return the persistent socket if it is open, wait for it if it is still
    // connecting, or open a new one otherwise.
    async _getOrOpenSocket() {
        const url = streamEndpoint(this.getSettings().provider_endpoint);
        const ws = this._ws;

        if (ws && this._wsUrl === url) {
            if (ws.readyState === 1 /* OPEN */) return ws;
            if (ws.readyState === 0 /* CONNECTING */) {
                // Another call is already opening this socket — piggyback on it.
                await new Promise((resolve, reject) => {
                    const onOpen = () => {
                        ws.removeEventListener('open', onOpen);
                        ws.removeEventListener('error', onError);
                        resolve();
                    };
                    const onError = () => {
                        ws.removeEventListener('open', onOpen);
                        ws.removeEventListener('error', onError);
                        reject(new Error('WebSocket connect failed'));
                    };
                    ws.addEventListener('open', onOpen);
                    ws.addEventListener('error', onError);
                });
                return this._ws; // re-read: _onSocketDied may have cleared it on error
            }
        }

        // Stale, closing/closed, or wrong URL — drop it and open fresh.
        if (ws) {
            try { ws.close(); } catch (e) { /* already closing */ }
            this._ws = null;
            this._wsUrl = null;
        }
        return this._openNewSocket(url);
    }

    // Generate over a persistent WebSocket. The socket's heartbeat resets an
    // *idle* timer on every frame, so a long generation is never killed by a
    // single total-time deadline (the failure mode of the fetch path). Binary
    // frames are assembled into a Blob and returned as a Response so the
    // SillyTavern provider contract (`response.blob()`) is preserved.
    // The socket stays open after each request to avoid the per-chunk TCP+WS
    // handshake that would otherwise add a noticeable gap between paragraphs.
    async generateViaWebSocket(requestBody) {
        if (!this.webSocketImpl) throw new Error('WebSocket is not available');

        const socket = await this._getOrOpenSocket();
        const idleLimit = this.generationTimeoutMs();
        const contentType = (requestBody.response_format || 'mp3') === 'wav' ? 'audio/wav' : 'audio/mpeg';
        const requestId = `st-${Date.now()}`;

        return new Promise((resolve, reject) => {
            const chunks = [];
            let settled = false;
            let idleTimer = null;

            const clearIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; };
            const armIdle = () => {
                clearIdle();
                idleTimer = setTimeout(() => {
                    // Close the socket — no frames means the connection is likely dead.
                    // The next generateViaWebSocket call will reconnect.
                    this.closeSocket();
                    settle(new Error('WebSocket idle timeout'));
                }, idleLimit);
            };

            const settle = (err, blob) => {
                if (settled) return;
                settled = true;
                clearIdle();
                if (this._activeReq?.settle === settle) this._activeReq = null;
                if (err) reject(err);
                else resolve(audioResponse(blob, contentType));
            };

            this._activeReq = {
                settle,
                onMessage(data) {
                    armIdle(); // any frame (including heartbeat pings) keeps the timer alive
                    if (typeof data !== 'string') { chunks.push(data); return; }
                    let frame;
                    try { frame = JSON.parse(data); } catch (e) { return; }
                    if (frame.type === 'error') settle(new Error(`${frame.code}: ${frame.detail}`));
                    else if (frame.type === 'done') settle(null, new Blob(chunks, { type: contentType }));
                },
            };

            armIdle();
            socket.send(JSON.stringify({ type: 'generate', id: requestId, request: requestBody }));
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
