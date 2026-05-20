// Schema-driven helpers: settings panel HTML, form-value reading,
// and speech-request payload construction are all built from the
// /api/capabilities response so adding an engine or parameter on the
// server requires zero client changes.

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function numberAttr(name, value) {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeAttr(value)}"`;
}

const TRISTATE_OPTIONS = [
    { value: 'default', label: 'Server default' },
    { value: 'on',      label: 'Force on' },
    { value: 'off',     label: 'Force off' },
];

function renderParameterControl(param) {
    const label = `<label for="local_tts_server_param_${escapeAttr(param.id)}">${escapeHtml(param.label)}</label>`;
    const id = `local_tts_server_param_${escapeAttr(param.id)}`;
    const placeholder = param.default !== undefined && param.default !== null
        ? ` placeholder="${escapeAttr(param.default)} default"`
        : ' placeholder="server default"';
    const description = param.description
        ? ` title="${escapeAttr(param.description)}"`
        : '';

    if (param.type === 'tristate') {
        const opts = TRISTATE_OPTIONS.map(
            (opt) => `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`,
        ).join('');
        return `${label}<select id="${id}" class="text_pole" data-param="${escapeAttr(param.id)}" data-type="tristate"${description}>${opts}</select>`;
    }

    const type = param.type === 'int' ? 'number' : 'number';
    return `${label}<input id="${id}" type="${type}" class="text_pole" data-param="${escapeAttr(param.id)}" data-type="${escapeAttr(param.type)}"${numberAttr('min', param.min)}${numberAttr('max', param.max)}${numberAttr('step', param.step)}${placeholder}${description}>`;
}

export function renderSettingsHtml(globalCaps, engineCapability) {
    const engines = (globalCaps?.engines ?? []).map((engine) => {
        // The server only runs one engine at a time, so non-active engines
        // are shown for discoverability but cannot be selected — picking one
        // would always 400 at the validate step in /v1/audio/speech.
        const selected = engine.is_active ? ' selected' : '';
        const disabled = engine.is_active ? '' : ' disabled';
        const label = engine.is_active
            ? engine.label || engine.id
            : `${engine.label || engine.id} (not running)`;
        return `<option value="${escapeAttr(engine.id)}"${selected}${disabled}>${escapeHtml(label)}</option>`;
    }).join('');

    const formats = (globalCaps?.response_formats ?? []).map((fmt) => {
        return `<option value="${escapeAttr(fmt.id)}">${escapeHtml(fmt.label || fmt.id)}</option>`;
    }).join('');

    const engineParams = (engineCapability?.parameters ?? []).map(renderParameterControl).join('');
    const globalParams = (globalCaps?.request_fields ?? []).map(renderParameterControl).join('');

    return `
        <div class="tts-server-provider-settings">
            <h4 class="textAlignCenter">Local TTS Server</h4>

            <label for="local_tts_server_endpoint">Server base URL</label>
            <input id="local_tts_server_endpoint" type="text" class="text_pole" maxlength="500">

            <div class="tts-server-provider-grid">
                <label for="local_tts_server_engine">Engine</label>
                <select id="local_tts_server_engine" class="text_pole" data-field="engine">${engines}</select>

                <label for="local_tts_server_format">Format</label>
                <select id="local_tts_server_format" class="text_pole" data-field="response_format">${formats}</select>

                <label for="local_tts_server_selector_mode">Voice list</label>
                <select id="local_tts_server_selector_mode" class="text_pole" data-field="selector_mode">
                    <option value="plain-plus-presets">Voices and voice+preset selectors</option>
                    <option value="plain-only">Voices only</option>
                    <option value="presets-only">Voice+preset selectors only</option>
                </select>

                <label for="local_tts_server_timeout_ms">Discovery timeout (ms)</label>
                <input id="local_tts_server_timeout_ms" type="number" class="text_pole" min="1000" step="500" title="Timeout for /status, voices, presets, and capabilities calls. Short is fine — these requests should return in milliseconds.">

                <label for="local_tts_server_generation_timeout_ms">Generation timeout (ms)</label>
                <input id="local_tts_server_generation_timeout_ms" type="number" class="text_pole" min="1000" step="1000" title="Timeout for /v1/audio/speech. Non-streaming TTS holds the connection open until the full clip is generated server-side, which for long text on local hardware can take minutes. Default 600000 (10 min) matches the server's Fish S2 default.">
            </div>

            <label for="local_tts_server_fallback_voices">Fallback voices</label>
            <div class="tts-server-provider-row">
                <input id="local_tts_server_fallback_voices" type="text" class="text_pole flex1" placeholder="alice,alice+calm">
                <button id="local_tts_server_snapshot_fallback" type="button" class="menu_button" title="Save the currently discovered voices into the fallback list so they remain available when the server is offline.">Snapshot discovered</button>
            </div>

            <div class="tts-server-provider-grid">${engineParams}${globalParams}</div>

            <div id="local_tts_server_status" class="tts-server-provider-status">Not checked</div>
        </div>`;
}

// ──────────────────────────────────────────────────────────────
// readSchemaValues(read, globalCaps, engineCapability)
// `read(paramId)` returns the raw string value from the DOM. Returns
// an object keyed by parameter id with type-coerced values, omitting
// blank entries and "default" tristates.
// ──────────────────────────────────────────────────────────────

function coerceParameterValue(param, raw) {
    if (raw === undefined || raw === null) return undefined;
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
    if (trimmed === '') return undefined;

    if (param.type === 'tristate') {
        if (trimmed === 'on') return true;
        if (trimmed === 'off') return false;
        return undefined; // 'default' → omit
    }
    if (param.type === 'int') {
        const n = Number(trimmed);
        if (!Number.isInteger(n)) return undefined;
        if (param.id === 'seed' && n < 0) return undefined; // -1 → random → omit
        return n;
    }
    // float
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
}

export function readSchemaValues(read, globalCaps, engineCapability) {
    const values = {};
    const schema = [
        ...(engineCapability?.parameters ?? []),
        ...(globalCaps?.request_fields ?? []),
    ];
    for (const param of schema) {
        const raw = read(param.id);
        const coerced = coerceParameterValue(param, raw);
        if (coerced !== undefined) values[param.id] = coerced;
    }
    return values;
}

// ──────────────────────────────────────────────────────────────
// buildSpeechRequest({...}) — strictly schema-driven payload
// ──────────────────────────────────────────────────────────────

export function buildSpeechRequest({
    engineId,
    response_format = 'mp3',
    speed = 1,
    stream = false,
    input,
    voice,
    values = {},
    engineCapability,
    globalCapabilities,
}) {
    const request = {
        model: engineId,
        input,
        voice,
        response_format,
        speed,
        stream,
    };

    const allowedIds = new Set([
        ...((engineCapability?.parameters ?? []).map((p) => p.id)),
        ...((globalCapabilities?.request_fields ?? []).map((p) => p.id)),
    ]);

    for (const [key, value] of Object.entries(values)) {
        if (!allowedIds.has(key)) continue;
        if (value === undefined || value === null) continue;
        request[key] = value;
    }

    return request;
}
