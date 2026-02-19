/**
 * API client - re-exports from generated client
 * Proxy auto-extracts .data from AxiosResponse
 * Import from here: import { client as api } from './api.ts';
 */

import { getOpenVoxAPI } from './client.ts';

const generated = getOpenVoxAPI();

export const client = new Proxy({}, {
  get(_, method) {
    return (...args) => generated[method](...args).then((res) => res.data);
  }
});

export const chunkAudioUrl = (episodeId, chunkIndex) => 
  `/api/studio/episodes/${episodeId}/audio/${chunkIndex}`;

export const fullEpisodeAudioUrl = (episodeId) => 
  `/api/studio/episodes/${episodeId}/audio/full`;
