const DEFAULT_REQUEST_BUDGETS = Object.freeze({
    'chatterbox-turbo': { limit: Infinity, unit: 'chars' },
    'fish-s2-pro': { limit: 3000, unit: 'chars' },
    omnivoice: { limit: Infinity, unit: 'chars' },
    'qwen3-tts': { limit: 2000, unit: 'chars' },
    voxcpm2: { limit: 2000, unit: 'chars' },
    audio8: { limit: 140, unit: 'speech_units' },
    cosyvoice2: { limit: Infinity, unit: 'chars' },
    cosyvoice3: { limit: Infinity, unit: 'chars' },
    dramabox: { limit: Infinity, unit: 'chars' },
    'higgs-tts-3': { limit: 2000, unit: 'chars' },
    moss: { limit: 2000, unit: 'chars' },
});

const BLOCK_TAGS = /<\/?(?:address|article|aside|blockquote|br|div|dl|dt|dd|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)\b[^>]*>/gi;

function decodeEntities(text) {
    const named = {
        amp: '&', apos: "'", gt: '>', hellip: '…', laquo: '«', ldquo: '“',
        lsquo: '‘', lt: '<', nbsp: ' ', quot: '"', raquo: '»', rdquo: '”', rsquo: '’',
    };
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
            const raw = radix === 16 ? entity.slice(2) : entity.slice(1);
            const codePoint = Number.parseInt(raw, radix);
            if (Number.isFinite(codePoint) && codePoint <= 0x10ffff) {
                try { return String.fromCodePoint(codePoint); } catch (_) { return match; }
            }
            return match;
        }
        return named[entity.toLowerCase()] ?? match;
    });
}

/** Remove markup syntax while retaining human-readable prose. */
export function cleanTtsText(input) {
    let text = String(input ?? '').replace(/\r\n?/g, '\n');
    text = text.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    text = text.replace(/<!--([\s\S]*?)-->/g, ' ');
    text = text.replace(BLOCK_TAGS, '\n');
    text = text.replace(/<\/?[a-z][^>]*>/gi, ' ');
    text = decodeEntities(text);
    // SillyTavern may hand providers escaped HTML from rendered messages.
    text = text.replace(BLOCK_TAGS, '\n');
    text = text.replace(/<\/?[a-z][^>]*>/gi, ' ');

    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\s*\[[^\]]*\]/g, '$1');
    text = text.replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, '');
    text = text.replace(/<https?:\/\/[^>]+>/gi, ' ');
    text = text.replace(/https?:\/\/\S+/gi, ' ');

    text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');
    text = text.replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, '$1');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/^\s{0,3}(?:#{1,6}|>+)\s*/gm, '');
    text = text.replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '');
    text = text.replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, '');
    text = text.replace(/[|]/g, ' ');
    text = text.replace(/(\*\*|~~|\*)/g, '');
    text = text.replace(/_+/g, ' ');
    text = text.replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1');

    return text
        .replace(/[ \t]+/g, ' ')
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Audio8 counts each Latin word or number, and each non-Latin letter/number. */
export function countSpeechUnits(input) {
    let units = 0;
    let inLatinWord = false;
    for (const character of String(input ?? '')) {
        const latinOrNumber = /[\p{Number}\p{Script=Latin}]/u.test(character);
        if (latinOrNumber) {
            if (!inLatinWord) units += 1;
            inLatinWord = true;
        } else if ((character === "'" || character === '’' || character === '-') && inLatinWord) {
            continue;
        } else {
            inLatinWord = false;
            if (/\p{Letter}/u.test(character)) units += 1;
        }
    }
    return units;
}

export function requestBudget(engineId, engineCapability) {
    const advertised = engineCapability?.chunking?.request_limit;
    if (Number.isFinite(advertised) && advertised > 0) {
        return { limit: advertised, unit: engineCapability.chunking.request_unit || 'chars' };
    }
    return DEFAULT_REQUEST_BUDGETS[String(engineId || '').toLowerCase()] ?? { limit: 2000, unit: 'chars' };
}

function splitOversizedUnit(text, count, limit) {
    const words = text.split(/\s+/).filter(Boolean);
    const atomic = words.length > 1 ? words : [...text];
    const separator = words.length > 1 ? ' ' : '';
    const chunks = [];
    let current = '';
    for (const item of atomic) {
        const candidate = current ? `${current}${separator}${item}` : item;
        if (current && count(candidate) > limit) {
            chunks.push(current);
            current = item;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

/** Split at sentences, then words/characters, guaranteeing every chunk fits. */
export function splitTextForSpeech(input, budget) {
    const text = String(input ?? '').trim();
    if (!text) return [];
    const limit = Number(budget?.limit);
    if (!Number.isFinite(limit) || limit <= 0) return [text];
    const count = budget?.unit === 'speech_units' ? countSpeechUnits : value => value.length;
    if (count(text) <= limit) return [text];

    const sentences = text.split(/(?<=[.!?。！？])(?:\s+|(?=[^\s]))|\n+/u).map(value => value.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
        if (count(sentence) > limit) {
            if (current) chunks.push(current);
            chunks.push(...splitOversizedUnit(sentence, count, limit));
            current = '';
            continue;
        }
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (current && count(candidate) > limit) {
            chunks.push(current);
            current = sentence;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
