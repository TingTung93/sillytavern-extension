import { DEFAULT_ENDPOINT, DEFAULT_MODEL } from './selectors.js';

export const DEFAULT_SETTINGS = Object.freeze({
    voiceMap: {},
    provider_endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    response_format: 'mp3',
    speed: 1,
    selector_mode: 'plain-plus-presets',
    fallback_voices: '',
    exaggeration: '',
    temperature: '',
    seed: -1,
    paralinguistic_tags: true,
    semantic_tags: false,
});

export function mergeSettings(settings = {}) {
    const merged = { ...DEFAULT_SETTINGS };
    for (const [key, value] of Object.entries(settings || {})) {
        if (key in DEFAULT_SETTINGS) {
            merged[key] = value;
        }
    }
    return merged;
}
