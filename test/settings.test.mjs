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

test('mergeSettings defaults tag controls to "default" (preserves preset behavior)', () => {
    const merged = mergeSettings({});
    assert.equal(merged.paralinguistic_tags, 'default');
    assert.equal(merged.semantic_tags, 'default');
});

test('mergeSettings migrates legacy boolean tag values to tri-state', () => {
    const migrated = mergeSettings({ paralinguistic_tags: true, semantic_tags: false });
    assert.equal(migrated.paralinguistic_tags, 'on', 'legacy true → "on"');
    assert.equal(migrated.semantic_tags, 'default', 'legacy false → "default" (previous false was an unintended preset override)');
});

test('mergeSettings does not include voiceMap (SillyTavern-owned state)', () => {
    assert.equal('voiceMap' in DEFAULT_SETTINGS, false);
});

test('mergeSettings supplies timeout_ms default', () => {
    assert.equal(typeof mergeSettings({}).timeout_ms, 'number');
    assert.ok(mergeSettings({}).timeout_ms >= 1000);
});
