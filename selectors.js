export const DEFAULT_ENDPOINT = 'http://127.0.0.1:7851';
export const DEFAULT_MODEL = 'chatterbox-turbo';

export function normalizeEndpoint(value) {
    const normalized = String(value || DEFAULT_ENDPOINT).trim().replace(/\/+$/, '');
    return normalized || DEFAULT_ENDPOINT;
}

export function speechEndpoint(baseUrl) {
    return `${normalizeEndpoint(baseUrl)}/v1/audio/speech`;
}

export function voiceIdOf(voice) {
    return String(voice?.voice_id || voice?.id || '').trim();
}

export function voiceNameOf(voice) {
    return String(voice?.name || voiceIdOf(voice)).trim();
}

export function presetIdOf(preset) {
    return String(preset?.id || preset?.preset_id || '').trim();
}

export function parseFallbackVoices(value) {
    return String(value || '')
        .split(',')
        .map(voice => voice.trim())
        .filter(Boolean)
        .map(voice => ({ name: voice, voice_id: voice, lang: 'en-US' }));
}

export function buildVoiceOptions(voices, presets, selectorMode = 'plain-plus-presets') {
    const options = [];
    const seen = new Set();
    const includePlain = selectorMode === 'plain-only' || selectorMode === 'plain-plus-presets';
    const includePresets = selectorMode === 'presets-only' || selectorMode === 'plain-plus-presets';

    for (const voice of voices || []) {
        const voiceId = voiceIdOf(voice);
        if (!voiceId) {
            continue;
        }
        const voiceName = voiceNameOf(voice);

        if (includePlain && !seen.has(voiceId)) {
            options.push({ name: voiceName, voice_id: voiceId, lang: 'en-US' });
            seen.add(voiceId);
        }

        if (!includePresets) {
            continue;
        }

        for (const preset of presets || []) {
            const presetId = presetIdOf(preset);
            if (!presetId) {
                continue;
            }
            const selector = `${voiceId}+${presetId}`;
            if (seen.has(selector)) {
                continue;
            }
            options.push({ name: `${voiceName} + ${presetId}`, voice_id: selector, lang: 'en-US' });
            seen.add(selector);
        }
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
}

function tagOverride(value) {
    if (value === 'on' || value === true) return true;
    if (value === 'off' || value === false) return false;
    return undefined;
}

export function buildSpeechRequest(settings, input, voiceId, overrides = {}) {
    const seed = Number(settings.seed);
    const request = {
        model: settings.model || DEFAULT_MODEL,
        input,
        voice: voiceId,
        response_format: settings.response_format || 'mp3',
        speed: Number(settings.speed || 1),
        stream: false,
    };

    const paralinguistic = tagOverride(settings.paralinguistic_tags);
    if (paralinguistic !== undefined) request.paralinguistic_tags = paralinguistic;
    const semantic = tagOverride(settings.semantic_tags);
    if (semantic !== undefined) request.semantic_tags = semantic;

    if (settings.exaggeration !== '' && settings.exaggeration !== null && settings.exaggeration !== undefined) {
        request.exaggeration = Number(settings.exaggeration);
    }
    if (settings.temperature !== '' && settings.temperature !== null && settings.temperature !== undefined) {
        request.temperature = Number(settings.temperature);
    }
    if (Number.isInteger(seed) && seed >= 0) {
        request.seed = seed;
    }

    return { ...request, ...overrides };
}
