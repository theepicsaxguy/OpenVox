/**
 * Player state management - core state and playback control
 */

import { client as api } from './api.bundle.js';
import * as state from './state.js';

let audio = null;
let currentEpisode = null;
let currentChunkIndex = 0;
let chunks = [];
let totalEpisodeDuration = 0;
let currentEpisodeTime = 0;
let isFullscreen = false;

export {
    audio,
    currentEpisode,
    currentChunkIndex,
    chunks,
    totalEpisodeDuration,
    currentEpisodeTime,
    isFullscreen,
    setIsFullscreen,
};

function setIsFullscreen(value) {
    isFullscreen = value;
}

export async function loadEpisode(episodeId, startChunk = null) {
    try {
        const episode = await api.getApiStudioEpisodesEpisodeId(episodeId);
        currentEpisode = episode;
        chunks = (episode.chunks || []).filter(c => c.status === 'ready');

        if (!chunks.length) {
            return { error: 'No ready chunks to play' };
        }

        totalEpisodeDuration = chunks.reduce((sum, c) => sum + (c.duration_secs || 0), 0);

        if (startChunk !== null) {
            currentChunkIndex = startChunk;
        } else if (episode.current_chunk_index != null) {
            currentChunkIndex = episode.current_chunk_index;
        } else {
            currentChunkIndex = 0;
        }

        const validIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
        if (validIdx < 0) currentChunkIndex = chunks[0].chunk_index;

        currentEpisodeTime = calculateEpisodeTime(currentChunkIndex);
        if (startChunk === null && episode.position_secs) {
            currentEpisodeTime = (currentEpisodeTime - (chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0)) + episode.position_secs;
        }

        state.set('playingEpisodeId', currentEpisode.id);
        state.set('playingChunkIndex', currentChunkIndex);

        return { episode, chunkIndex: currentChunkIndex };
    } catch (e) {
        return { error: e.message };
    }
}

export function calculateEpisodeTime(chunkIndex) {
    let time = 0;
    for (const chunk of chunks) {
        if (chunk.chunk_index < chunkIndex) {
            time += chunk.duration_secs || 0;
        }
    }
    return time;
}

export function calculateEpisodeProgress() {
    if (!totalEpisodeDuration || !audio) return 0;
    return (currentEpisodeTime / totalEpisodeDuration) * 100;
}

export function getAudio() {
    return audio;
}

export function setAudio(newAudio) {
    audio = newAudio;
}

export function getCurrentEpisode() {
    return currentEpisode;
}

export function setCurrentEpisode(episode) {
    currentEpisode = episode;
}

export function getCurrentChunkIndex() {
    return currentChunkIndex;
}

export function setCurrentChunkIndex(idx) {
    currentChunkIndex = idx;
}

export function getIsFullscreen() {
    return isFullscreen;
}

export function getChunks() {
    return chunks;
}

export function setChunks(newChunks) {
    chunks = newChunks;
}

export function getTotalDuration() {
    return totalEpisodeDuration;
}

export function setTotalDuration(duration) {
    totalEpisodeDuration = duration;
}

export function getCurrentTime() {
    return currentEpisodeTime;
}

export function setCurrentTime(time) {
    currentEpisodeTime = time;
}

export function getCurrentSubtitleText() {
    return currentSubtitleText;
}

export function setCurrentSubtitleText(text) {
    currentSubtitleText = text;
}

export function getSubtitleSentences() {
    return subtitleSentences;
}

export function setSubtitleSentences(sentences) {
    subtitleSentences = sentences;
}

export function getSubtitleTimings() {
    return subtitleTimings;
}

export function setSubtitleTimings(timings) {
    subtitleTimings = timings;
}

let currentSubtitleText = '';
let subtitleSentences = [];
let subtitleTimings = [];

export function getIsMuted() {
    return isMuted;
}

export function setIsMuted(value) {
    isMuted = value;
}

export function getPreviousVolume() {
    return previousVolume;
}

export function setPreviousVolume(value) {
    previousVolume = value;
}

let isMuted = false;
let previousVolume = 1;
