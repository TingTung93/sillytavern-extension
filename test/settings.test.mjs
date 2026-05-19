import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings } from '../settings.js';

test('mergeSettings keeps defaults', () => {
    assert.deepEqual(mergeSettings({}), DEFAULT_SETTINGS);
});

test('mergeSettings accepts known keys and drops unknown keys', () => {
    assert.deepEqual(
        mergeSettings({ model: 'custom-model', unknown: true }),
        { ...DEFAULT_SETTINGS, model: 'custom-model' },
    );
});
