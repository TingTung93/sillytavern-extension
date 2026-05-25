// Zero-dependency fake jQuery + DOM for unit-testing provider.js without a
// browser, jsdom, or jQuery. provider.js touches a small, known slice of the
// jQuery API ($('#id') / $('[data-param=x]') with .val/.html/.text/.on/.is/
// .toggleClass and chaining), so we implement exactly that surface. Crucially,
// .html(str) regex-registers the controls that renderSettingsHtml emits, so
// tests drive the real render -> populate -> read round-trip.

function parseAttrs(blob) {
    const attrs = {};
    const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(blob)) !== null) attrs[m[1]] = m[2];
    return attrs;
}

// Resolve a <select>'s initial value the way a browser would: the option
// marked `selected`, otherwise the first option.
function selectValue(html, openTagEnd) {
    const close = html.indexOf('</select>', openTagEnd);
    const inner = html.slice(openTagEnd, close === -1 ? undefined : close);
    const selected = inner.match(/<option\s+value="([^"]*)"[^>]*\bselected/);
    if (selected) return selected[1];
    const first = inner.match(/<option\s+value="([^"]*)"/);
    return first ? first[1] : '';
}

export function installHarness() {
    const byId = new Map();
    const byParam = new Map();
    const saveCalls = [];

    function makeElement({ tag = 'input', id = '', dataParam = '', dataType = '', value = '' } = {}) {
        return {
            tag, id, dataParam, dataType,
            value: String(value),
            text: '',
            html: '',
            classes: new Set(),
            handlers: {},
        };
    }

    function registerFromHtml(html) {
        const re = /<(input|select|textarea|button|div)\b([^>]*)>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const tag = m[1];
            const attrs = parseAttrs(m[2]);
            if (!attrs.id && !attrs['data-param']) continue;
            let value = attrs.value ?? '';
            if (tag === 'select') value = selectValue(html, re.lastIndex);
            const el = makeElement({
                tag,
                id: attrs.id || '',
                dataParam: attrs['data-param'] || '',
                dataType: attrs['data-type'] || '',
                value,
            });
            if (el.id) byId.set(el.id, el);
            if (el.dataParam) byParam.set(el.dataParam, el);
        }
    }

    function resolve(selector) {
        const idMatch = selector.match(/^#(.+)$/);
        if (idMatch) {
            let el = byId.get(idMatch[1]);
            if (!el) { el = makeElement({ id: idMatch[1] }); byId.set(idMatch[1], el); }
            return el;
        }
        const paramMatch = selector.match(/^\[data-param="(.+)"\]$/);
        if (paramMatch) {
            let el = byParam.get(paramMatch[1]);
            if (!el) { el = makeElement({ dataParam: paramMatch[1] }); byParam.set(paramMatch[1], el); }
            return el;
        }
        return makeElement();
    }

    function wrap(el) {
        const api = {
            val(next) {
                if (next === undefined) return el.value;
                el.value = next === null || next === undefined ? '' : String(next);
                return api;
            },
            html(next) {
                if (next === undefined) return el.html;
                el.html = String(next);
                registerFromHtml(el.html);
                return api;
            },
            text(next) {
                if (next === undefined) return el.text;
                el.text = String(next);
                return api;
            },
            on(event, handler) {
                el.handlers[event] = handler;
                return api;
            },
            is(tag) { return el.tag === tag; },
            toggleClass(cls, on) {
                if (on) el.classes.add(cls); else el.classes.delete(cls);
                return api;
            },
            get _el() { return el; },
        };
        return api;
    }

    const $ = (selector) => wrap(resolve(selector));

    const audio = () => ({
        pause() {}, play: async () => {}, load() {},
        currentTime: 0, src: '', onended: null,
    });

    const previousGlobals = {
        $: globalThis.$,
        document: globalThis.document,
        URL: globalThis.URL,
        __ttsMock: globalThis.__ttsMock,
    };

    globalThis.$ = $;
    globalThis.document = { createElement: (t) => (t === 'audio' ? audio() : {}) };
    globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL() {} };
    globalThis.__ttsMock = {
        saveTtsProviderSettings: () => saveCalls.push(Date.now()),
        getPreviewString: () => 'This is a preview.',
        registerTtsProvider: () => {},
    };

    return {
        $,
        el: (selector) => resolve(selector),
        setValue(selector, value) { resolve(selector).value = String(value); },
        fire(selector, event) {
            const el = resolve(selector);
            const handler = el.handlers[event];
            if (!handler) throw new Error(`no '${event}' handler bound for ${selector}`);
            return handler();
        },
        saveCount: () => saveCalls.length,
        reset() { byId.clear(); byParam.clear(); saveCalls.length = 0; },
        restore() { Object.assign(globalThis, previousGlobals); },
    };
}
