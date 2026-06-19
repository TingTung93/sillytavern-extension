import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalTtsServerApi } from '../api.js';

function jsonResponse(body, init = {}) {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
        blob: async () => new Blob(),
    };
}

function makeSettings(overrides = {}) {
    return () => ({
        provider_endpoint: 'http://127.0.0.1:7851',
        model: 'chatterbox-turbo',
        response_format: 'mp3',
        speed: 1,
        seed: -1,
        exaggeration: '',
        temperature: '',
        paralinguistic_tags: 'default',
        semantic_tags: 'default',
        timeout_ms: 60_000,
        ...overrides,
    });
}

test('GET requests forward an AbortSignal to fetch', async () => {
    let captured;
    const fakeFetch = (url, init) => {
        captured = init;
        return Promise.resolve(jsonResponse({ state: 'ready' }));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    await api.status();
    assert.ok(captured, 'fetch was called');
    assert.ok(captured.signal, 'fetch init has a signal');
    assert.equal(typeof captured.signal.aborted, 'boolean', 'signal looks like an AbortSignal');
});

test('POST /v1/audio/speech forwards an AbortSignal to fetch', async () => {
    let captured;
    const fakeFetch = (url, init) => {
        captured = init;
        return Promise.resolve(jsonResponse({}));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    await api.generate({ model: 'm', input: 'hello', voice: 'alice', response_format: 'mp3', speed: 1, stream: false });
    assert.ok(captured.signal, 'generate forwards a signal too');
});

test('generate sends the request body verbatim (no client-side mutation)', async () => {
    let capturedBody;
    const fakeFetch = (url, init) => {
        capturedBody = init.body;
        return Promise.resolve(jsonResponse({}));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    const payload = { model: 'chatterbox-turbo', input: 'hi', voice: 'alice', response_format: 'mp3', speed: 1, stream: false, temperature: 0.7 };
    await api.generate(payload);
    assert.deepEqual(JSON.parse(capturedBody), payload);
});

test('discovery requests use timeout_ms; generation uses generation_timeout_ms (so long TTS generations are not killed by the discovery timeout)', async () => {
    // Same hanging fetch for both calls. We control which timeout fires by
    // setting timeout_ms short and generation_timeout_ms long.
    function hangingFetch(url, init) {
        return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
                const e = new Error('aborted');
                e.name = 'AbortError';
                reject(e);
            });
        });
    }

    const discoveryApi = new LocalTtsServerApi(
        () => ({ provider_endpoint: 'http://x', timeout_ms: 1_000, generation_timeout_ms: 60_000 }),
        hangingFetch,
    );
    const discStart = Date.now();
    await assert.rejects(discoveryApi.status(), (e) => e.name === 'AbortError' || /abort/i.test(e.message));
    const discElapsed = Date.now() - discStart;
    assert.ok(discElapsed < 1500, `status() should abort near 1000ms (was ${discElapsed}ms)`);

    const generateApi = new LocalTtsServerApi(
        () => ({ provider_endpoint: 'http://x', timeout_ms: 1_000, generation_timeout_ms: 2_500 }),
        hangingFetch,
    );
    const genStart = Date.now();
    await assert.rejects(
        generateApi.generate({ model: 'm', input: 'hi', voice: 'a', response_format: 'mp3', speed: 1, stream: false }),
        (e) => e.name === 'AbortError' || /abort/i.test(e.message),
    );
    const genElapsed = Date.now() - genStart;
    assert.ok(genElapsed >= 2400, `generate() must wait for generation_timeout_ms (~2500ms), was ${genElapsed}ms (would be ~1000ms if discovery timeout were applied)`);
});

test('request aborts when timeout elapses', async () => {
    let signalSeen;
    const hangingFetch = (url, init) => {
        signalSeen = init.signal;
        return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
    };
    const api = new LocalTtsServerApi(makeSettings({ timeout_ms: 1000 }), hangingFetch);

    const start = Date.now();
    await assert.rejects(api.status(), (err) => err.name === 'AbortError' || /abort/i.test(err.message));
    const elapsed = Date.now() - start;
    assert.ok(signalSeen.aborted, 'signal was aborted');
    assert.ok(elapsed < 1500, `aborted in ${elapsed}ms (should be near timeout)`);
});

test('successful response within timeout does not throw', async () => {
    const fakeFetch = () => Promise.resolve(jsonResponse({ state: 'ready' }));
    const api = new LocalTtsServerApi(makeSettings({ timeout_ms: 5000 }), fakeFetch);
    const status = await api.status();
    assert.equal(status.state, 'ready');
});

test('capabilities() GETs /api/capabilities and returns the body', async () => {
    let lastUrl;
    const fakeFetch = (url) => {
        lastUrl = url;
        return Promise.resolve(jsonResponse({ current_engine: 'chatterbox-turbo', engines: [], response_formats: [], request_fields: [] }));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    const caps = await api.capabilities();
    assert.equal(lastUrl, 'http://127.0.0.1:7851/api/capabilities');
    assert.equal(caps.current_engine, 'chatterbox-turbo');
});

test('engineCapability(id) GETs /api/capabilities/{id} and returns body', async () => {
    let lastUrl;
    const fakeFetch = (url) => {
        lastUrl = url;
        return Promise.resolve(jsonResponse({ id: 'chatterbox-turbo', label: 'Chatterbox Turbo', parameters: [] }));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    const cap = await api.engineCapability('chatterbox-turbo');
    assert.equal(lastUrl, 'http://127.0.0.1:7851/api/capabilities/chatterbox-turbo');
    assert.equal(cap.id, 'chatterbox-turbo');
});

test('switchEngine(id) POSTs /api/engine with the engine id', async () => {
    let lastUrl, lastInit;
    const fakeFetch = (url, init) => {
        lastUrl = url;
        lastInit = init;
        return Promise.resolve(jsonResponse({ engine: 'omnivoice', state: 'ready' }));
    };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    const body = await api.switchEngine('omnivoice');
    assert.equal(lastUrl, 'http://127.0.0.1:7851/api/engine');
    assert.equal(lastInit.method, 'POST');
    assert.equal(JSON.parse(lastInit.body).engine, 'omnivoice');
    assert.equal(body.engine, 'omnivoice');
});

test('engineCapability returns null for 404 instead of throwing', async () => {
    const fakeFetch = () => Promise.resolve({
        ok: false,
        status: 404,
        text: async () => 'not found',
        json: async () => ({ detail: 'not found' }),
    });
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    const cap = await api.engineCapability('nope');
    assert.equal(cap, null);
});

test('engineCapability returns null when id is empty (no fetch)', async () => {
    let fetchCalls = 0;
    const fakeFetch = () => { fetchCalls += 1; return Promise.resolve(jsonResponse({})); };
    const api = new LocalTtsServerApi(makeSettings(), fakeFetch);
    assert.equal(await api.engineCapability(''), null);
    assert.equal(await api.engineCapability(null), null);
    assert.equal(fetchCalls, 0);
});

// --- WebSocket generation path -------------------------------------------

class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.sent = [];
        this.closed = false;
        MockWebSocket.last = this;
        // onopen handler is assigned after construction; defer so it sees it.
        queueMicrotask(() => { if (this.onopen) this.onopen(); });
    }
    send(data) { this.sent.push(data); }
    close() { this.closed = true; }
    emit(data) { if (this.onmessage) this.onmessage({ data }); }
    error() { if (this.onerror) this.onerror({}); }
    end() { if (this.onclose) this.onclose({}); }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('generateViaWebSocket sends a generate frame on open and resolves with assembled audio', async () => {
    const api = new LocalTtsServerApi(makeSettings({ response_format: 'wav' }), undefined, MockWebSocket);
    const body = { model: 'chatterbox-turbo', input: 'hi', voice: 'alice', response_format: 'wav', speed: 1 };
    const pending = api.generateViaWebSocket(body);
    await flush();

    const ws = MockWebSocket.last;
    assert.equal(ws.url, 'ws://127.0.0.1:7851/v1/audio/stream');
    const sent = JSON.parse(ws.sent[0]);
    assert.equal(sent.type, 'generate');
    assert.ok(sent.id.startsWith('st-'));
    assert.deepEqual(sent.request, body);

    ws.emit(new Uint8Array([1, 2, 3]).buffer);
    ws.emit(new Uint8Array([4, 5]).buffer);
    ws.emit(JSON.stringify({ type: 'done', id: sent.id, bytes: 5, duration_ms: 10 }));

    const response = await pending;
    assert.equal(response.ok, true);
    assert.equal(response.headers.get('Content-Type'), 'audio/wav');
    const blob = await response.blob();
    assert.equal(blob.size, 5);
    assert.ok(ws.closed, 'socket closed after completion');
});

test('generateViaWebSocket rejects on an error frame', async () => {
    const api = new LocalTtsServerApi(makeSettings(), undefined, MockWebSocket);
    const pending = api.generateViaWebSocket({ input: 'hi', voice: 'alice', response_format: 'mp3' });
    await flush();
    const ws = MockWebSocket.last;
    ws.emit(JSON.stringify({ type: 'error', id: 'x', code: 'oom', detail: 'CUDA out of memory' }));
    await assert.rejects(pending, (error) => /oom/.test(error.message));
});

test('generateViaWebSocket rejects when the socket closes before done', async () => {
    const api = new LocalTtsServerApi(makeSettings(), undefined, MockWebSocket);
    const pending = api.generateViaWebSocket({ input: 'hi', voice: 'alice', response_format: 'mp3' });
    await flush();
    MockWebSocket.last.end();
    await assert.rejects(pending, (error) => /closed before completion/.test(error.message));
});

test('a frame resets the idle timeout, so heartbeats keep a slow generation alive', async () => {
    // Idle limit 1000ms (the api clamps anything below). A ping at 700ms resets
    // it (would otherwise fire at 1000), and done at 1300ms then succeeds —
    // proving the timer is per-frame, not a single total-time deadline.
    const api = new LocalTtsServerApi(
        makeSettings({ generation_timeout_ms: 1000 }),
        undefined,
        MockWebSocket,
    );
    const pending = api.generateViaWebSocket({ input: 'hi', voice: 'alice', response_format: 'wav' });
    await flush();
    const ws = MockWebSocket.last;
    setTimeout(() => ws.emit(JSON.stringify({ type: 'ping' })), 700);
    setTimeout(() => {
        ws.emit(new Uint8Array([1, 2]).buffer);
        ws.emit(JSON.stringify({ type: 'done', id: 'x', bytes: 2, duration_ms: 1 }));
    }, 1300);
    const response = await pending;
    const blob = await response.blob();
    assert.equal(blob.size, 2);
});

test('generateViaWebSocket times out when idle past the generation timeout', async () => {
    // 1000ms is the minimum the api honours; below it the 600s default applies.
    const api = new LocalTtsServerApi(
        makeSettings({ generation_timeout_ms: 1000 }),
        undefined,
        MockWebSocket,
    );
    const start = Date.now();
    const pending = api.generateViaWebSocket({ input: 'hi', voice: 'alice', response_format: 'mp3' });
    // Never emit anything: the idle timer must fire.
    await assert.rejects(pending, (error) => /idle timeout/.test(error.message));
    assert.ok(Date.now() - start < 1500, 'idle timeout fires near 1000ms');
});

test('does not invoke fetchImpl with the api instance as receiver (avoids browser "Illegal invocation")', async () => {
    // Browsers throw TypeError when fetch is called with a non-window `this`.
    // Simulate that: this fake throws if called with `this === api instance`.
    let lastThis = null;
    function strictFetch(url, init) {
        lastThis = this;
        if (this && this !== globalThis && (this.fetchImpl === strictFetch || 'getSettings' in this)) {
            const err = new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
            return Promise.reject(err);
        }
        return Promise.resolve(jsonResponse({ state: 'ready' }));
    }
    const api = new LocalTtsServerApi(makeSettings(), strictFetch);
    await api.status();
    assert.ok(!(lastThis && 'getSettings' in (lastThis || {})), `fetchImpl must not be called with the api instance as 'this' (was: ${lastThis && lastThis.constructor && lastThis.constructor.name})`);
});
