import test from 'node:test';
import assert from 'node:assert/strict';
import { readFormValues } from '../form.js';

const FIELDS = {
    provider_endpoint: () => ' http://127.0.0.1:7851/ ',
    model: () => 'chatterbox-turbo',
    response_format: () => 'wav',
    selector_mode: () => 'plain-only',
    fallback_voices: () => 'alice,bob',
    speed: () => '1.25',
    exaggeration: () => '0.6',
    temperature: () => '',
    seed: () => '42',
    timeout_ms: () => '15000',
    paralinguistic_tags: () => 'on',
    semantic_tags: () => 'default',
};

function read(field) {
    return FIELDS[field]();
}

test('readFormValues coerces numeric fields uniformly to numbers', () => {
    const values = readFormValues(read);
    assert.equal(typeof values.speed, 'number');
    assert.equal(values.speed, 1.25);
    assert.equal(typeof values.seed, 'number');
    assert.equal(values.seed, 42);
    assert.equal(typeof values.timeout_ms, 'number');
    assert.equal(values.timeout_ms, 15000);
});

test('readFormValues keeps optional numeric fields as strings to preserve blank state', () => {
    const values = readFormValues(read);
    assert.equal(values.exaggeration, '0.6');
    assert.equal(values.temperature, '');
});

test('readFormValues passes through tri-state tag values verbatim', () => {
    const values = readFormValues(read);
    assert.equal(values.paralinguistic_tags, 'on');
    assert.equal(values.semantic_tags, 'default');
});

test('readFormValues trims provider_endpoint and other text fields', () => {
    const values = readFormValues(read);
    assert.equal(values.provider_endpoint, 'http://127.0.0.1:7851/');
});

test('readFormValues falls back to safe defaults on bad numbers', () => {
    const noisy = (field) => ({
        ...FIELDS,
        speed: () => '',
        seed: () => 'NaNNN',
        timeout_ms: () => '0',
    }[field]());
    const values = readFormValues(noisy);
    assert.equal(values.speed, 1, 'blank speed → 1');
    assert.equal(values.seed, -1, 'invalid seed → -1 (means "random")');
    assert.equal(values.timeout_ms, 60000, 'sub-1s timeout snapped to default');
});
