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
    await api.generate('hello', 'alice');
    assert.ok(captured.signal, 'generate forwards a signal too');
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
