import { DEFAULT_ENDPOINT, DEFAULT_MODEL } from './selectors.js';

export const DEFAULT_TIMEOUT_MS = 60_000;
// /v1/audio/speech non-streaming responses are held open until full TTS
// generation completes (server-side semaphore = 1 + per-paragraph Fish S2
// inference can take minutes). Server's own fish_s2_timeout defaults to 600s.
export const DEFAULT_GENERATION_TIMEOUT_MS = 600_000;

export const DEFAULT_SETTINGS = Object.freeze({
    provider_endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    response_format: 'mp3',
    speed: 1,
    selector_mode: 'plain-plus-presets',
    fallback_voices: '',
    timeout_ms: DEFAULT_TIMEOUT_MS,
    generation_timeout_ms: DEFAULT_GENERATION_TIMEOUT_MS,
    // schema-driven parameter slots (flat: param id → raw string value);
    // the active engine's capability schema decides which are visible/sent.
    exaggeration: '',
    temperature: '',
    top_p: '',
    top_k: '',
    repetition_penalty: '',
    seed: -1,
    lead_in_tag: '',
    paralinguistic_tags: 'default',
    semantic_tags: 'default',
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
    if (!Number.isFinite(merged.generation_timeout_ms) || merged.generation_timeout_ms < 1000) {
        merged.generation_timeout_ms = DEFAULT_GENERATION_TIMEOUT_MS;
    }
    return merged;
}
