import { DEFAULT_TIMEOUT_MS } from './settings.js';

const TEXT_FIELDS = [
    'provider_endpoint',
    'model',
    'response_format',
    'selector_mode',
    'fallback_voices',
    'paralinguistic_tags',
    'semantic_tags',
];

const KEEP_BLANK_NUMERIC_FIELDS = ['exaggeration', 'temperature'];

function parseSpeed(raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseSeed(raw) {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : -1;
}

function parseTimeout(raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_TIMEOUT_MS;
}

export function readFormValues(read) {
    const values = {};
    for (const field of TEXT_FIELDS) {
        values[field] = String(read(field) ?? '').trim();
    }
    for (const field of KEEP_BLANK_NUMERIC_FIELDS) {
        values[field] = String(read(field) ?? '').trim();
    }
    values.speed = parseSpeed(read('speed'));
    values.seed = parseSeed(read('seed'));
    values.timeout_ms = parseTimeout(read('timeout_ms'));
    return values;
}
