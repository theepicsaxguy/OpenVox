/**
 * Chunk loading and playback
 */

import { client as api } from './api.ts';
import * as state from './state.js';
import * as playerState from './player-state.js';
import { toast } from './main.js';
import { triggerHaptic } from './utils.js';

export async function loadEpisode(episodeId, startChunk = null) {
    try {
        const episode = await api.getApiStudioEpisodesEpisodeId(episodeId);
        playerState.setCurrentEpisode(episode);

        const chunks = (episode.chunks || []).filter(c => c.status === 'ready');
        playerState.setChunks(chunks);

        if (!chunks.length) {
            toast('No ready chunks to play', 'error');
            return { error: 'No ready chunks to play' };
        }

        const totalDuration = chunks.reduce((sum, c) => sum + (c.duration_secs || 0), 0);
        playerState.setTotalDuration(totalDuration);

        let currentChunkIndex;
        if (startChunk !== null) {
            currentChunkIndex = startChunk;
        } else if (episode.current_chunk_index != null) {
            currentChunkIndex = episode.current_chunk_index;
        } else {
            currentChunkIndex = 0;
        }

        const validIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
        if (validIdx < 0) currentChunkIndex = chunks[0].chunk_index;

        playerState.setCurrentChunkIndex(currentChunkIndex);

        let currentEpisodeTime = playerState.calculateEpisodeTime(currentChunkIndex);
        if (startChunk === null && episode.position_secs) {
            currentEpisodeTime = (currentEpisodeTime - (chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0)) + episode.position_secs;
        }
        playerState.setCurrentTime(currentEpisodeTime);

        state.set('playingEpisodeId', episode.id);
        state.set('playingChunkIndex', currentChunkIndex);

        const { showPlayer: _showPlayer, updateCoverArt, updateNowPlayingView, updatePlayerUI: _updatePlayerUI } = window.playerRender || {};
        if (_showPlayer) _showPlayer();

        const titleEl = document.getElementById('player-title');
        if (titleEl) titleEl.textContent = episode.title;

        await loadChunk(currentChunkIndex);

        const audio = playerState.getAudio();
        try {
            await audio.play();
            const { startWaveformAnimation } = window.playerWaveform || {};
            if (startWaveformAnimation) startWaveformAnimation();
        } catch {}

        if (startChunk === null && episode.position_secs) {
            const _chunkDuration = chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0;
            audio.currentTime = episode.position_secs;
        }

        if (updateCoverArt) updateCoverArt();
        if (updateNowPlayingView) updateNowPlayingView();

        return { episode, chunkIndex: currentChunkIndex };
    } catch (e) {
        toast(`Player error: ${e.message}`, 'error');
        return { error: e.message };
    }
}

export async function loadChunk(chunkIndex) {
    const episode = playerState.getCurrentEpisode();
    const chunks = playerState.getChunks();

    playerState.setCurrentChunkIndex(chunkIndex);
    state.set('playingChunkIndex', chunkIndex);

    const chunk = chunks.find(c => c.chunk_index === chunkIndex);
    if (!chunk || !episode) return;

    const url = api.chunkAudioUrl(episode.id, chunkIndex);

    let audio = playerState.getAudio();
    if (!audio) {
        audio = new Audio();
        setupAudioEvents(audio);
        playerState.setAudio(audio);
    }

    audio.src = url;
    audio.load();

    const savedSpeed = localStorage.getItem('pocket_tts_playback_speed');
    if (savedSpeed) {
        audio.playbackRate = parseFloat(savedSpeed);
    }

    const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
    if (isFullscreen) {
        const { updateFullscreenUI } = window.playerRender || {};
        if (updateFullscreenUI) updateFullscreenUI();
    }

    const { updatePlayerUI, updateNowPlayingView } = window.playerRender || {};
    if (updatePlayerUI) updatePlayerUI();
    if (updateNowPlayingView) updateNowPlayingView();
}

function setupAudioEvents(audio) {
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMetadataLoaded);

    audio.addEventListener('play', () => {
        const { updatePlayPauseIcon } = window.playerControls || {};
        if (updatePlayPauseIcon) updatePlayPauseIcon(true);

        const { startWaveformAnimation } = window.playerWaveform || {};
        if (startWaveformAnimation) startWaveformAnimation();

        const { updateNowPlayingView, updateFullscreenUI } = window.playerRender || {};
        if (updateNowPlayingView) updateNowPlayingView();

        const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
        if (isFullscreen && updateFullscreenUI) updateFullscreenUI();
    });

    audio.addEventListener('pause', () => {
        const { updatePlayPauseIcon, savePosition } = window.playerControls || {};
        if (updatePlayPauseIcon) updatePlayPauseIcon(false);

        const { stopWaveformAnimation, drawWaveform } = window.playerWaveform || {};
        if (stopWaveformAnimation) stopWaveformAnimation();
        if (drawWaveform) drawWaveform();

        if (savePosition) savePosition();

        const { updateNowPlayingView, updateFullscreenUI, updateMediaSession } = window.playerRender || {};
        if (updateNowPlayingView) updateNowPlayingView();

        const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
        if (isFullscreen && updateFullscreenUI) updateFullscreenUI();

        if (updateMediaSession) updateMediaSession();
    });

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            const audio = playerState.getAudio();
            if (audio) audio.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            const audio = playerState.getAudio();
            if (audio) audio.pause();
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
            const { skip } = window.playerControls || {};
            if (skip) skip(-10);
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
            const { skip } = window.playerControls || {};
            if (skip) skip(10);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            const { prevChunk } = window.playerControls || {};
            if (prevChunk) prevChunk();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const { nextChunk } = window.playerControls || {};
            if (nextChunk) nextChunk();
        });
    }
}

function onTimeUpdate() {
    const audio = playerState.getAudio();
    if (!audio || !audio.duration) return;

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const _currentChunkDuration = chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0;
    const chunkStartTime = playerState.calculateEpisodeTime(currentChunkIndex);
    playerState.setCurrentTime(chunkStartTime + audio.currentTime);

    const { updateTimeDisplays } = window.playerRender || {};
    if (updateTimeDisplays) updateTimeDisplays();
}

function onMetadataLoaded() {
    const { updateMetadataDisplay } = window.playerRender || {};
    if (updateMetadataDisplay) updateMetadataDisplay();
}

function onEnded() {
    const episode = playerState.getCurrentEpisode();
    if (episode) {
        addToHistory({ ...episode, percent_listened: 100 });
    }

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    if (idx >= 0 && idx < chunks.length - 1) {
        const next = chunks[idx + 1];
        loadChunk(next.chunk_index);
        const audio = playerState.getAudio();
        if (audio) audio.play().catch(() => {});
    } else {
        const { savePosition, updatePlayPauseIcon } = window.playerControls || {};
        if (savePosition) savePosition(100);
        if (updatePlayPauseIcon) updatePlayPauseIcon(false);

        const { stopWaveformAnimation, drawWaveform } = window.playerWaveform || {};
        if (stopWaveformAnimation) stopWaveformAnimation();
        if (drawWaveform) drawWaveform();

        const { updateNowPlayingView } = window.playerRender || {};
        if (updateNowPlayingView) updateNowPlayingView();

        triggerHaptic('success');
        toast('Episode complete!', 'success');
    }
}

const HISTORY_KEY = 'pocket_tts_playback_history';
const MAX_HISTORY = 50;

function addToHistory(episode) {
    if (!episode) return;

    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history = history.filter(h => h.id !== episode.id);

    history.unshift({
        id: episode.id,
        title: episode.title,
        playedAt: Date.now(),
        progress: episode.percent_listened || 0,
    });

    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    state.emit('history-updated', history);
}

export function getPlaybackHistory() {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}
