/**
 * Chunk loading and playback
 */

import { client as api, chunkAudioUrl } from './api.bundle.js';
import * as state from './state.js';
import * as playerState from './player-state.js';
import * as playerRender from './player-render.js';
import * as playerControls from './player-controls.js';
import * as playerWaveform from './player-waveform.js';
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

        playerRender.showPlayer();

        const titleEl = document.getElementById('player-title');
        if (titleEl) titleEl.textContent = episode.title;

        await loadChunk(currentChunkIndex);

        const audio = playerState.getAudio();
        try {
            await audio.play();
            playerWaveform.startWaveformAnimation();
        } catch (e) {
            console.warn('Auto-play blocked:', e.message);
        }

        if (startChunk === null && episode.position_secs) {
            const _chunkDuration = chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0;
            audio.currentTime = episode.position_secs;
        }

        playerRender.updateCoverArt();
        playerRender.updateNowPlayingView();

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

    const url = chunkAudioUrl(episode.id, chunkIndex);

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

    if (playerState.getIsFullscreen()) {
        playerRender.updateFullscreenUI();
    }

    playerRender.updatePlayerUI();
    playerRender.updateNowPlayingView();
}

function setupAudioEvents(audio) {
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMetadataLoaded);

    audio.addEventListener('play', () => {
        playerControls.updatePlayPauseIcon(true);
        playerWaveform.startWaveformAnimation();
        playerRender.updateNowPlayingView();
        if (playerState.getIsFullscreen()) {
            playerRender.updateFullscreenUI();
        }
    });

    audio.addEventListener('pause', () => {
        playerControls.updatePlayPauseIcon(false);
        playerWaveform.stopWaveformAnimation();
        playerWaveform.drawWaveform();
        playerControls.savePosition();
        playerRender.updateNowPlayingView();
        if (playerState.getIsFullscreen()) {
            playerRender.updateFullscreenUI();
        }
        playerRender.updateMediaSession();
    });

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            const audio = playerState.getAudio();
            if (audio) audio.play().catch((e) => console.warn('MediaSession play failed:', e.message));
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            const audio = playerState.getAudio();
            if (audio) audio.pause();
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => playerControls.skip(-10));
        navigator.mediaSession.setActionHandler('seekforward', () => playerControls.skip(10));
        navigator.mediaSession.setActionHandler('previoustrack', () => playerControls.prevChunk());
        navigator.mediaSession.setActionHandler('nexttrack', () => playerControls.nextChunk());
    }
}

function onTimeUpdate() {
    const audio = playerState.getAudio();
    if (!audio || !isFinite(audio.duration)) return;

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const _currentChunkDuration = chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0;
    const chunkStartTime = playerState.calculateEpisodeTime(currentChunkIndex);
    playerState.setCurrentTime(chunkStartTime + audio.currentTime);

    playerRender.updateTimeDisplays();
}

function onMetadataLoaded() {
    playerRender.updateMetadataDisplay();
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
        if (audio) audio.play().catch((e) => console.warn('Auto-advance play failed:', e.message));
    } else {
        playerControls.savePosition(100);
        playerControls.updatePlayPauseIcon(false);
        playerWaveform.stopWaveformAnimation();
        playerWaveform.drawWaveform();
        playerRender.updateNowPlayingView();

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
