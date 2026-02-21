/**
 * API client - pure JavaScript fetch-based wrapper.
 * Replaces the TypeScript/axios generated client for browser compatibility.
 * Import from here: import { client as api, chunkAudioUrl, fullEpisodeAudioUrl } from './api.js';
 */

async function request(method, url, data, isFormData = false) {
    const opts = { method, headers: {} };
    if (data && !isFormData) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(data);
    } else if (data && isFormData) {
        opts.body = data;
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        let msg = text;
        try { msg = JSON.parse(text).error || text; } catch (_) {}
        throw new Error(msg);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return {};
}

const api = {
    getV1Voices: () => request('GET', '/v1/voices'),
    postV1AudioSpeech: (data) => request('POST', '/v1/audio/speech', data),

    postApiStudioSources: (data) => {
        if (data instanceof FormData) return request('POST', '/api/studio/sources', data, true);
        return request('POST', '/api/studio/sources', data);
    },
    getApiStudioSources: () => request('GET', '/api/studio/sources'),
    getApiStudioSourcesSourceId: (id) => request('GET', `/api/studio/sources/${id}`),
    putApiStudioSourcesSourceId: (id, data) => request('PUT', `/api/studio/sources/${id}`, data),
    deleteApiStudioSourcesSourceId: (id) => request('DELETE', `/api/studio/sources/${id}`),
    postApiStudioSourcesSourceIdCover: (id, data) => {
        const fd = new FormData();
        fd.append('cover', data.cover);
        return request('POST', `/api/studio/sources/${id}/cover`, fd, true);
    },
    postApiStudioSourcesSourceIdReClean: (id, data) => request('POST', `/api/studio/sources/${id}/re-clean`, data),
    putApiStudioSourcesSourceIdMove: (id, data) => request('PUT', `/api/studio/sources/${id}/move`, data),
    postApiStudioSourcesSourceIdTags: (id, data) => request('POST', `/api/studio/sources/${id}/tags`, data),

    postApiStudioEpisodes: (data) => request('POST', '/api/studio/episodes', data),
    getApiStudioEpisodes: () => request('GET', '/api/studio/episodes'),
    getApiStudioEpisodesEpisodeId: (id) => request('GET', `/api/studio/episodes/${id}`),
    putApiStudioEpisodesEpisodeId: (id, data) => request('PUT', `/api/studio/episodes/${id}`, data),
    deleteApiStudioEpisodesEpisodeId: (id) => request('DELETE', `/api/studio/episodes/${id}`),
    postApiStudioEpisodesEpisodeIdRegenerate: (id) => request('POST', `/api/studio/episodes/${id}/regenerate`),
    postApiStudioEpisodesEpisodeIdRegenerateWithSettings: (id, data) => request('POST', `/api/studio/episodes/${id}/regenerate-with-settings`, data),
    postApiStudioUndoUndoId: (id) => request('POST', `/api/studio/undo/${id}`),
    postApiStudioEpisodesBulkMove: (data) => request('POST', '/api/studio/episodes/bulk-move', data),
    postApiStudioEpisodesBulkDelete: (data) => request('POST', '/api/studio/episodes/bulk-delete', data),
    postApiStudioEpisodesEpisodeIdChunksChunkIndexRegenerate: (epId, ci) => request('POST', `/api/studio/episodes/${epId}/chunks/${ci}/regenerate`),
    postApiStudioEpisodesEpisodeIdCancel: (id) => request('POST', `/api/studio/episodes/${id}/cancel`),
    postApiStudioEpisodesEpisodeIdRetryErrors: (id) => request('POST', `/api/studio/episodes/${id}/retry-errors`),
    putApiStudioEpisodesEpisodeIdMove: (id, data) => request('PUT', `/api/studio/episodes/${id}/move`, data),
    postApiStudioEpisodesEpisodeIdTags: (id, data) => request('POST', `/api/studio/episodes/${id}/tags`, data),

    postApiStudioFolders: (data) => request('POST', '/api/studio/folders', data),
    putApiStudioFoldersFolderId: (id, data) => request('PUT', `/api/studio/folders/${id}`, data),
    deleteApiStudioFoldersFolderId: (id) => request('DELETE', `/api/studio/folders/${id}`),
    postApiStudioFoldersFolderIdPlaylist: (id) => request('POST', `/api/studio/folders/${id}/playlist`),
    getApiStudioFoldersFolderIdEpisodes: (id) => request('GET', `/api/studio/folders/${id}/episodes`),

    postApiStudioReorder: (data) => request('POST', '/api/studio/reorder', data),

    getApiStudioTags: () => request('GET', '/api/studio/tags'),
    postApiStudioTags: (data) => request('POST', '/api/studio/tags', data),
    deleteApiStudioTagsTagId: (id) => request('DELETE', `/api/studio/tags/${id}`),

    getApiStudioPlaybackEpisodeId: (id) => request('GET', `/api/studio/playback/${id}`),
    postApiStudioPlaybackEpisodeId: (id, data) => request('POST', `/api/studio/playback/${id}`, data),

    getApiStudioSettings: () => request('GET', '/api/studio/settings'),
    putApiStudioSettings: (data) => request('PUT', '/api/studio/settings', data),

    getApiStudioGenerationStatus: () => request('GET', '/api/studio/generation/status'),
    getApiStudioLibraryTree: () => request('GET', '/api/studio/library/tree'),

    postApiStudioPreviewClean: (data) => request('POST', '/api/studio/preview-clean', data),
    postApiStudioPreviewContent: (data) => request('POST', '/api/studio/preview-content', data),
    postApiStudioPreviewChunks: (data) => request('POST', '/api/studio/preview-chunks', data),
};

export const client = api;

export const chunkAudioUrl = (episodeId, chunkIndex) =>
    `/api/studio/episodes/${episodeId}/audio/${chunkIndex}`;

export const fullEpisodeAudioUrl = (episodeId) =>
    `/api/studio/episodes/${episodeId}/audio/full`;
