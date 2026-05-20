import { DEFAULT_ENDPOINT, DEFAULT_MODEL } from './selectors.js';

export const DEFAULT_TIMEOUT_MS = 60_000;

export const DEFAULT_SETTINGS = Object.freeze({
    provider_endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    response_format: 'mp3',
    speed: 1,
    selector_mode: 'plain-plus-presets',
    fallback_voices: '',
    exaggeration: '',
    temperature: '',
    seed: -1,
    paralinguistic_tags: 'default',
    semantic_tags: 'default',
    timeout_ms: DEFAULT_TIMEOUT_MS,
});

const TAG_VALUES = new Set(['default', 'on', 'off']);

function migrateTagValue(value) {
    if (TAG_VALUES.has(value)) return value;
    if (value === true) return 'on';
    if (value === false) return 'default';
    return 'default';
}

export function mergeSettings(settings = {}) {
    const merged = { ...DEFAULT_SETTINGS };
    for (const [key, value] of Object.entries(settings || {})) {
        if (key in DEFAULT_SETTINGS) {
            merged[key] = value;
        }
    }
    merged.paralinguistic_tags = migrateTagValue(merged.paralinguistic_tags);
    merged.semantic_tags = migrateTagValue(merged.semantic_tags);
    if (!Number.isFinite(merged.timeout_ms) || merged.timeout_ms < 1000) {
        merged.timeout_ms = DEFAULT_TIMEOUT_MS;
    }
    return merged;
}
