/**
 * API wrapper for /api/studio/* endpoints.
 */

const BASE = '/api/studio';

async function request(path, options = {}) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, options);
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const body = await res.json();
            msg = body.error || msg;
        } catch {}
        throw new Error(msg);
    }
    return res.json();
}

function jsonOpts(method, body) {
    return {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

// ── Sources ─────────────────────────────────────────────────────────

export function createSourceFromText(text, title, codeBlockRule) {
    return request('/sources', jsonOpts('POST', { text, title, code_block_rule: codeBlockRule }));
}

export function createSourceFromUrl(url, codeBlockRule) {
    return request('/sources', jsonOpts('POST', { url, code_block_rule: codeBlockRule }));
}

export async function createSourceFromFile(file, codeBlockRule) {
    const form = new FormData();
    form.append('file', file);
    form.append('code_block_rule', codeBlockRule);
    const res = await fetch(`${BASE}/sources`, { method: 'POST', body: form });
    if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || res.statusText);
    }
    return res.json();
}

export function listSources(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/sources${qs ? '?' + qs : ''}`);
}

export function getSource(id) {
    return request(`/sources/${id}`);
}

export function updateSource(id, data) {
    return request(`/sources/${id}`, jsonOpts('PUT', data));
}

export function deleteSource(id) {
    return request(`/sources/${id}`, { method: 'DELETE' });
}

export function reCleanSource(id, codeBlockRule) {
    return request(`/sources/${id}/re-clean`, jsonOpts('POST', { code_block_rule: codeBlockRule }));
}

export function previewClean(text, codeBlockRule) {
    return request('/preview-clean', jsonOpts('POST', { text, code_block_rule: codeBlockRule }));
}

// ── Chunks & Episodes ───────────────────────────────────────────────

export function previewChunks(text, strategy, maxChars) {
    return request('/preview-chunks', jsonOpts('POST', { text, strategy, max_chars: maxChars }));
}

export function createEpisode(data) {
    return request('/episodes', jsonOpts('POST', data));
}

export function listEpisodes(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/episodes${qs ? '?' + qs : ''}`);
}

export function getEpisode(id) {
    return request(`/episodes/${id}`);
}

export function deleteEpisode(id) {
    return request(`/episodes/${id}`, { method: 'DELETE' });
}

export function updateEpisode(id, data) {
    return request(`/episodes/${id}`, jsonOpts('PUT', data));
}

export function regenerateEpisode(id) {
    return request(`/episodes/${id}/regenerate`, { method: 'POST' });
}

export function regenerateChunk(episodeId, chunkIndex) {
    return request(`/episodes/${episodeId}/chunks/${chunkIndex}/regenerate`, { method: 'POST' });
}

export function chunkAudioUrl(episodeId, chunkIndex) {
    return `${BASE}/episodes/${episodeId}/audio/${chunkIndex}`;
}

export function fullEpisodeAudioUrl(episodeId) {
    return `${BASE}/episodes/${episodeId}/audio/full`;
}

export function generationStatus() {
    return request('/generation/status');
}

// ── Library ─────────────────────────────────────────────────────────

export function libraryTree() {
    return request('/library/tree');
}

export function createFolder(name, parentId) {
    return request('/folders', jsonOpts('POST', { name, parent_id: parentId }));
}

export function updateFolder(id, data) {
    return request(`/folders/${id}`, jsonOpts('PUT', data));
}

export function deleteFolder(id) {
    return request(`/folders/${id}`, { method: 'DELETE' });
}

export function moveSource(id, folderId) {
    return request(`/sources/${id}/move`, jsonOpts('PUT', { folder_id: folderId }));
}

export function moveEpisode(id, folderId) {
    return request(`/episodes/${id}/move`, jsonOpts('PUT', { folder_id: folderId }));
}

// ── Tags ────────────────────────────────────────────────────────────

export function listTags() {
    return request('/tags');
}

export function createTag(name) {
    return request('/tags', jsonOpts('POST', { name }));
}

export function deleteTag(id) {
    return request(`/tags/${id}`, { method: 'DELETE' });
}

export function setSourceTags(sourceId, tagIds) {
    return request(`/sources/${sourceId}/tags`, jsonOpts('POST', { tag_ids: tagIds }));
}

export function setEpisodeTags(episodeId, tagIds) {
    return request(`/episodes/${episodeId}/tags`, jsonOpts('POST', { tag_ids: tagIds }));
}

// ── Playback ────────────────────────────────────────────────────────

export function getPlayback(episodeId) {
    return request(`/playback/${episodeId}`);
}

export function savePlayback(episodeId, data) {
    return request(`/playback/${episodeId}`, jsonOpts('POST', data));
}

// ── Settings ────────────────────────────────────────────────────────

export function getSettings() {
    return request('/settings');
}

export function updateSettings(data) {
    return request('/settings', jsonOpts('PUT', data));
}

// ── Voices (existing API) ───────────────────────────────────────────

export async function listVoices() {
    const res = await fetch('/v1/voices');
    if (!res.ok) throw new Error('Failed to list voices');
    const data = await res.json();
    return data.data || [];
}
