export function renderSettingsHtml() {
    return `
        <div class="tts-server-provider-settings">
            <h4 class="textAlignCenter">Local TTS Server</h4>

            <label for="local_tts_server_endpoint">Server base URL</label>
            <input id="local_tts_server_endpoint" type="text" class="text_pole" maxlength="500">

            <div class="tts-server-provider-grid">
                <label for="local_tts_server_model">Model</label>
                <input id="local_tts_server_model" type="text" class="text_pole" maxlength="200">

                <label for="local_tts_server_format">Format</label>
                <select id="local_tts_server_format" class="text_pole">
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                </select>

                <label for="local_tts_server_selector_mode">Voice list</label>
                <select id="local_tts_server_selector_mode" class="text_pole">
                    <option value="plain-plus-presets">Voices and voice+preset selectors</option>
                    <option value="plain-only">Voices only</option>
                    <option value="presets-only">Voice+preset selectors only</option>
                </select>
            </div>

            <label for="local_tts_server_fallback_voices">Fallback voices</label>
            <div class="tts-server-provider-row">
                <input id="local_tts_server_fallback_voices" type="text" class="text_pole flex1" placeholder="alice,alice+calm">
                <button id="local_tts_server_snapshot_fallback" type="button" class="menu_button" title="Save the currently discovered voices into the fallback list so they remain available when the server is offline.">Snapshot discovered</button>
            </div>

            <div class="tts-server-provider-grid">
                <label for="local_tts_server_speed">Speed <span id="local_tts_server_speed_output"></span></label>
                <input id="local_tts_server_speed" type="range" min="0.25" max="4" step="0.05">

                <label for="local_tts_server_exaggeration">Exaggeration</label>
                <input id="local_tts_server_exaggeration" type="number" class="text_pole" min="0" max="2" step="0.05">

                <label for="local_tts_server_temperature">Temperature</label>
                <input id="local_tts_server_temperature" type="number" class="text_pole" min="0" max="2" step="0.05">

                <label for="local_tts_server_seed">Seed</label>
                <input id="local_tts_server_seed" type="number" class="text_pole" step="1">

                <label for="local_tts_server_timeout_ms">Request timeout (ms)</label>
                <input id="local_tts_server_timeout_ms" type="number" class="text_pole" min="1000" step="500">
            </div>

            <label for="local_tts_server_paralinguistic_tags">Paralinguistic tags</label>
            <select id="local_tts_server_paralinguistic_tags" class="text_pole" title="Deterministic paralinguistic tag transforms applied to message text before generation. 'Server default' lets the preset or server choose.">
                <option value="default">Server default</option>
                <option value="on">Force on</option>
                <option value="off">Force off</option>
            </select>

            <label for="local_tts_server_semantic_tags">Semantic tags</label>
            <select id="local_tts_server_semantic_tags" class="text_pole" title="LLM-planned semantic tag injection. Requires a semantic tagger configured on the server. 'Server default' lets the preset or server choose.">
                <option value="default">Server default</option>
                <option value="on">Force on</option>
                <option value="off">Force off</option>
            </select>

            <div id="local_tts_server_status" class="tts-server-provider-status">Not checked</div>
        </div>`;
}
