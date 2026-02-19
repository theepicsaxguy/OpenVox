/**
 * Player controls - play/pause, seek, volume, speed
 */

import { client as api } from './api.ts';
import { $, triggerHaptic } from './utils.js';
import { toast } from './main.js';
import * as playerState from './player-state.js';

let saveTimer = null;

export function initControls() {
    $('player-play').addEventListener('click', togglePlay);
    $('player-skip-back').addEventListener('click', () => skip(-10));
    $('player-skip-fwd').addEventListener('click', () => skip(10));
    $('player-prev').addEventListener('click', prevChunk);
    $('player-next').addEventListener('click', nextChunk);

    $('player-scrubber').addEventListener('input', (e) => {
        const audio = playerState.getAudio();
        if (!audio || !audio.duration) return;
        audio.currentTime = (e.target.value / 100) * audio.duration;
        document.getElementById('scrubber-fill').style.width = `${e.target.value}%`;
    });

    $('player-download').addEventListener('click', () => {
        const episode = playerState.getCurrentEpisode();
        const chunkIndex = playerState.getCurrentChunkIndex();
        if (episode) {
            window.open(api.chunkAudioUrl(episode.id, chunkIndex), '_blank');
        }
    });

    initSpeedControl();
    initVolumeControl();
    initMuteControl();
    initKeyboardShortcuts();
    startPeriodicSave();

    window.addEventListener('beforeunload', () => savePosition());
}

function initSpeedControl() {
    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) {
        const savedSpeed = localStorage.getItem('pocket_tts_playback_speed');
        if (savedSpeed) {
            speedSelect.value = savedSpeed;
            const audio = playerState.getAudio();
            if (audio) {
                audio.playbackRate = parseFloat(savedSpeed);
            }
            const fsSpeedSelect = document.getElementById('fs-playback-speed');
            if (fsSpeedSelect) {
                fsSpeedSelect.value = savedSpeed;
            }
        }

        speedSelect.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value);
            const audio = playerState.getAudio();
            if (audio) {
                audio.playbackRate = speed;
            }
            localStorage.setItem('pocket_tts_playback_speed', speed);
            const fsSpeedSelect = document.getElementById('fs-playback-speed');
            if (fsSpeedSelect) {
                fsSpeedSelect.value = speed;
            }
        });
    }
}

function initVolumeControl() {
    const fsVolumeSlider = document.getElementById('fs-volume-slider');
    const fsMuteBtn = document.getElementById('fs-btn-mute');
    const audio = playerState.getAudio();
    if (fsVolumeSlider && audio) {
        fsVolumeSlider.value = audio.volume;
        fsVolumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (audio) audio.volume = vol;
            localStorage.setItem('pocket_tts_volume', vol);
            updateMuteButton(vol > 0, fsMuteBtn);
        });
    }
}

function initMuteControl() {
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            toggleMute();
            triggerHaptic('light');
        });
    }
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        switch (e.key) {
        case ' ':
            e.preventDefault();
            togglePlay();
            triggerHaptic('light');
            break;
        case 'ArrowLeft':
            e.preventDefault();
            skip(-10);
            break;
        case 'ArrowRight':
            e.preventDefault();
            skip(10);
            break;
        case 'n':
        case 'N':
            nextChunk();
            break;
        case 'p':
        case 'P':
            prevChunk();
            break;
        case 'm':
        case 'M':
            toggleMute();
            break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
            const audio = playerState.getAudio();
            if (audio && audio.duration) {
                const percent = parseInt(e.key) * 10;
                audio.currentTime = (percent / 100) * audio.duration;
            }
            break;
        }
        }
    });
}

export function togglePlay() {
    const audio = playerState.getAudio();
    if (!audio) return;
    if (audio.paused) {
        audio.play().catch(() => {});
    } else {
        audio.pause();
        savePosition();
    }
    updatePlayPauseIcon(!audio.paused);
}

export function play() {
    const audio = playerState.getAudio();
    if (audio) {
        audio.play().catch(() => {});
    }
}

export function pause() {
    const audio = playerState.getAudio();
    if (audio) {
        audio.pause();
    }
}

export function skip(secs) {
    const audio = playerState.getAudio();
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + secs));
}

export function seek(time) {
    const audio = playerState.getAudio();
    if (audio && audio.duration) {
        audio.currentTime = time;
    }
}

export function prevChunk() {
    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    if (idx > 0) {
        savePosition();
        const { loadChunk: chunkLoad } = window.playerChunk || {};
        if (chunkLoad) {
            chunkLoad(chunks[idx - 1].chunk_index);
            const audio = playerState.getAudio();
            if (audio) audio.play().catch(() => {});
        }
    }
}

export function nextChunk() {
    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    if (idx >= 0 && idx < chunks.length - 1) {
        savePosition();
        const { loadChunk: chunkLoad } = window.playerChunk || {};
        if (chunkLoad) {
            chunkLoad(chunks[idx + 1].chunk_index);
            const audio = playerState.getAudio();
            if (audio) audio.play().catch(() => {});
        }
    }
}

export function toggleMute(btnElement = null) {
    const audio = playerState.getAudio();
    if (!audio) return;

    const isMuted = playerState.getIsMuted();
    const previousVolume = playerState.getPreviousVolume();

    if (isMuted) {
        audio.volume = previousVolume;
        playerState.setIsMuted(false);
    } else {
        playerState.setPreviousVolume(audio.volume || 1);
        audio.volume = 0;
        playerState.setIsMuted(true);
    }

    updateMuteUI();
    if (btnElement) {
        updateMuteButton(!playerState.getIsMuted(), btnElement);
    }
    const fsVolumeSlider = document.getElementById('fs-volume-slider');
    if (fsVolumeSlider) {
        fsVolumeSlider.value = audio.volume;
    }
    toast(playerState.getIsMuted() ? 'Muted' : 'Unmuted', 'info');
}

export function updateMuteButton(isMuted, btn) {
    if (!btn) return;
    const volIcon = btn.querySelector('.volume-icon');
    const muteIcon = btn.querySelector('.mute-icon');
    if (volIcon) volIcon.style.display = isMuted ? 'none' : 'block';
    if (muteIcon) muteIcon.style.display = isMuted ? 'block' : 'none';
}

function updateMuteUI() {
    const isMuted = playerState.getIsMuted();
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
        muteBtn.classList.toggle('muted', isMuted);
    }
    const fsMuteBtn = document.getElementById('fs-btn-mute');
    if (fsMuteBtn) {
        updateMuteButton(!isMuted, fsMuteBtn);
    }
}

export function updatePlayPauseIcon(playing) {
    const playIcon = $('play-icon');
    const pauseIcon = $('pause-icon');
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';

    const fsPlayIcon = $('fs-play-icon');
    const fsPauseIcon = $('fs-pause-icon');
    if (fsPlayIcon) fsPlayIcon.style.display = playing ? 'none' : 'block';
    if (fsPauseIcon) fsPauseIcon.style.display = playing ? 'block' : 'none';

    const indicator = $('fs-playing-indicator');
    if (indicator) indicator.classList.toggle('active', playing);
}

function savePosition(forcePct) {
    const episode = playerState.getCurrentEpisode();
    if (!episode) return;

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    const totalChunks = chunks.length;
    let pct = forcePct;
    if (pct == null) {
        const audio = playerState.getAudio();
        const chunkPct = (audio && audio.duration)
            ? (audio.currentTime / audio.duration)
            : 0;
        pct = totalChunks > 0
            ? ((idx + chunkPct) / totalChunks) * 100
            : 0;
    }

    api.postApiStudioPlaybackEpisodeId(episode.id, {
        current_chunk_index: currentChunkIndex,
        position_secs: playerState.getAudio() ? playerState.getAudio().currentTime : 0,
        percent_listened: Math.min(100, pct),
    }).catch(() => {});
}

function startPeriodicSave() {
    clearInterval(saveTimer);
    saveTimer = setInterval(() => savePosition(), 30000);
}

export function setPlaybackSpeed(speed) {
    const audio = playerState.getAudio();
    if (audio) {
        audio.playbackRate = speed;
    }
    const speedSelect = document.getElementById('playback-speed');
    if (speedSelect) {
        speedSelect.value = speed.toString();
    }
    localStorage.setItem('pocket_tts_playback_speed', speed);
}

export { savePosition };
