import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { installHarness } from './dom-harness.mjs';

// Mock SillyTavern's '../../tts/index.js' before provider.js is imported, then
// install the fake DOM so the constructor's document.createElement('audio') and
// all jQuery calls resolve.
register('./tts-mock.hooks.mjs', import.meta.url);
const harness = installHarness();
const { LocalTtsServerProvider } = await import('../provider.js');
const { mergeSettings, DEFAULT_GENERATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = await import('../settings.js');

const CAPS = {
    current_engine: 'chatterbox-turbo',
    engines: [
        { id: 'chatterbox-turbo', label: 'Chatterbox Turbo', is_active: true },
        { id: 'fish-s2-pro', label: 'Fish S2 Pro', is_active: false },
    ],
    response_formats: [{ id: 'mp3', label: 'MP3' }, { id: 'wav', label: 'WAV' }],
    request_fields: [
        { id: 'paralinguistic_tags', type: 'tristate', label: 'Paralinguistic tags', default: 'default' },
        { id: 'semantic_tags', type: 'tristate', label: 'Semantic tags', default: 'default' },
    ],
};

const ENGINE_CAP = {
    id: 'chatterbox-turbo',
    label: 'Chatterbox Turbo',
    parameters: [
        { id: 'exaggeration', type: 'float', label: 'Exaggeration', min: 0, max: 2, step: 0.05, default: 0.5 },
        { id: 'temperature', type: 'float', label: 'Temperature', min: 0, max: 2, step: 0.05, default: 0.8 },
    ],
};

function fakeApi(opts = {}) {
    return {
        calls: opts,
        capabilities: async () => { if (opts.capsError) throw new Error('boom'); return opts.caps ?? CAPS; },
        engineCapability: async () => opts.engineCap ?? ENGINE_CAP,
        status: async () => { if (opts.statusError) throw new Error('down'); return opts.status ?? { engine: 'chatterbox-turbo', model_status: 'ready' }; },
        voices: async () => opts.voices ?? [],
        presets: async () => opts.presets ?? [],
        generate: async (body) => { opts.generated = body; return { blob: async () => ({}) }; },
    };
}

function freshProvider({ settings, api } = {}) {
    harness.reset();
    const provider = new LocalTtsServerProvider();
    if (settings) provider.settings = settings;
    provider.api = api ?? fakeApi();
    return provider;
}

test('constructor applies merged default settings', () => {
    const provider = freshProvider();
    assert.equal(provider.settings.model, 'chatterbox-turbo');
    assert.equal(provider.settings.response_format, 'mp3');
    assert.equal(provider.settings.generation_timeout_ms, DEFAULT_GENERATION_TIMEOUT_MS);
});

test('refreshCapabilitiesAndRender syncs settings.model to the server active engine', async () => {
    // Persisted (stale) model differs from what the server is actually running.
    const provider = freshProvider({ settings: mergeSettings({ model: 'fish-s2-pro' }) });
    const before = harness.saveCount();

    await provider.refreshCapabilitiesAndRender();

    assert.equal(provider.settings.model, 'chatterbox-turbo', 'snaps to server active engine');
    assert.ok(harness.saveCount() > before, 'persists the corrected model');
    assert.equal(provider.engineCap, ENGINE_CAP);
    assert.equal(harness.el('#local_tts_server_engine').tag, 'select', 'engine dropdown rendered');
});

test('refreshCapabilitiesAndRender does not re-save when the engine already matches', async () => {
    const provider = freshProvider({ settings: mergeSettings({ model: 'chatterbox-turbo' }) });
    const before = harness.saveCount();
    await provider.refreshCapabilitiesAndRender();
    assert.equal(harness.saveCount(), before, 'no settings write when model is already correct');
});

test('capability fetch failure renders the fallback shell and reports an error', async () => {
    const provider = freshProvider({ api: fakeApi({ capsError: true }) });

    await provider.refreshCapabilitiesAndRender();

    const status = harness.el('#local_tts_server_status');
    assert.match(status.text, /Capability fetch failed/);
    assert.ok(status.classes.has('error'), 'status flagged as error');
    assert.equal(harness.el('#local_tts_server_endpoint').tag, 'input', 'fallback endpoint input rendered');
});

test('populateFields fills envelope fields and maps a blank tristate to "default"', async () => {
    const provider = freshProvider({ settings: mergeSettings({ provider_endpoint: 'http://host:9000' }) });
    await provider.refreshCapabilitiesAndRender();

    assert.equal(harness.el('#local_tts_server_endpoint').value, 'http://host:9000');

    provider.settings.semantic_tags = '';
    provider.populateFields();
    assert.equal(harness.el('[data-param="semantic_tags"]').value, 'default');
});

test('onSettingsChange reads the DOM back into settings and clamps timeouts', async () => {
    const provider = freshProvider();
    await provider.refreshCapabilitiesAndRender();

    harness.setValue('#local_tts_server_endpoint', 'http://host:1');
    harness.setValue('#local_tts_server_timeout_ms', '3000');
    harness.setValue('#local_tts_server_generation_timeout_ms', 'not-a-number');
    harness.setValue('[data-param="temperature"]', '0.7');
    const before = harness.saveCount();

    provider.onSettingsChange();

    assert.equal(provider.settings.provider_endpoint, 'http://host:1');
    assert.equal(provider.settings.timeout_ms, 3000);
    assert.equal(provider.settings.generation_timeout_ms, DEFAULT_GENERATION_TIMEOUT_MS, 'invalid timeout falls back to default');
    assert.equal(provider.settings.temperature, '0.7', 'schema param stored as raw string');
    assert.ok(harness.saveCount() > before, 'change is persisted');
});

test('parseTimeout accepts valid values and rejects sub-1000ms / non-numeric', () => {
    const provider = freshProvider();
    assert.equal(provider.parseTimeout('5000', DEFAULT_TIMEOUT_MS), 5000);
    assert.equal(provider.parseTimeout('500', DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS);
    assert.equal(provider.parseTimeout('nope', DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS);
});

test('snapshotDiscoveredFallback writes discovered voice ids into the fallback field', async () => {
    const provider = freshProvider();
    await provider.refreshCapabilitiesAndRender();
    provider.voices = [{ voice_id: 'alice' }, { voice_id: 'bob' }];
    const before = harness.saveCount();

    provider.snapshotDiscoveredFallback();

    assert.equal(provider.settings.fallback_voices, 'alice,bob');
    assert.equal(harness.el('#local_tts_server_fallback_voices').value, 'alice,bob');
    assert.ok(harness.el('#local_tts_server_status').classes.has('success'));
    assert.ok(harness.saveCount() > before);
});

test('snapshotDiscoveredFallback with no voices reports an error and does not persist', async () => {
    const provider = freshProvider();
    await provider.refreshCapabilitiesAndRender();
    provider.voices = [];
    const before = harness.saveCount();

    provider.snapshotDiscoveredFallback();

    assert.ok(harness.el('#local_tts_server_status').classes.has('error'));
    assert.equal(harness.saveCount(), before, 'nothing saved when there is nothing to snapshot');
});

test('checkReady falls back to configured fallback voices when the server is unreachable', async () => {
    const provider = freshProvider({
        settings: mergeSettings({ fallback_voices: 'x,y' }),
        api: fakeApi({ statusError: true }),
    });

    await provider.checkReady();

    assert.equal(provider.voices.length, 2, 'uses the fallback voice list');
    assert.match(harness.el('#local_tts_server_status').text, /Server check failed/);
});

test('buildRequestBody emits a schema-driven payload from the rendered controls', async () => {
    const provider = freshProvider();
    await provider.refreshCapabilitiesAndRender();
    harness.setValue('[data-param="temperature"]', '0.7');
    harness.setValue('[data-param="exaggeration"]', ''); // blank -> omitted

    const body = provider.buildRequestBody('hello', 'alice');

    assert.deepEqual(body, {
        model: 'chatterbox-turbo',
        input: 'hello',
        voice: 'alice',
        response_format: 'mp3',
        speed: 1,
        stream: false,
        temperature: 0.7,
    });
});

test('getVoice resolves by name or voice_id and throws when missing', async () => {
    const provider = freshProvider();
    provider.voices = [{ name: 'Alice', voice_id: 'alice' }];

    assert.equal((await provider.getVoice('alice')).voice_id, 'alice');
    assert.equal((await provider.getVoice('Alice')).voice_id, 'alice');
    await assert.rejects(provider.getVoice('nope'), /not found/);
});
