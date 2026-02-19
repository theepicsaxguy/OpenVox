/**
 * Player rendering functions - mini player, fullscreen player, UI updates
 */

import { client as api } from './api.ts';
import { toast } from './main.js';
import { $, formatTime, triggerHaptic } from './utils.js';
import * as playerState from './player-state.js';

export function initFullscreenPlayer() {
    const fullscreenPlayer = $('fullscreen-player');
    const miniPlayerExpand = $('btn-expand-player');

    if (!fullscreenPlayer) return;

    if (miniPlayerExpand) {
        miniPlayerExpand.addEventListener('click', openFullscreenPlayer);
    }

    $('fs-btn-minimize').addEventListener('click', closeFullscreenPlayer);

    const { togglePlay } = window.playerControls || {};
    if (togglePlay) {
        $('fs-btn-play').addEventListener('click', togglePlay);
    }

    $('fs-scrubber').addEventListener('input', handleFullscreenSeek);

    $('fs-btn-shuffle').addEventListener('click', () => {
        toast('Shuffle: Coming soon', 'info');
    });

    $('fs-btn-repeat').addEventListener('click', () => {
        toast('Repeat: Coming soon', 'info');
    });

    initFullscreenSpeedControl();
    initFullscreenVolume();
    initFullscreenButtons();

    document.addEventListener('keydown', handleFullscreenKeydown);
}

function handleFullscreenSeek(e) {
    const totalDuration = playerState.getTotalDuration();
    const chunks = playerState.getChunks();
    if (!totalDuration || !chunks.length) return;

    const pct = parseFloat(e.target.value);
    const targetTime = (pct / 100) * totalDuration;

    let timeAccum = 0;
    let targetChunk = chunks[0];
    for (const chunk of chunks) {
        const chunkDur = chunk.duration_secs || 0;
        if (timeAccum + chunkDur > targetTime) {
            targetChunk = chunk;
            break;
        }
        timeAccum += chunkDur;
    }

    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const audio = playerState.getAudio();

    if (targetChunk.chunk_index === currentChunkIndex && audio) {
        const chunkStartTime = playerState.calculateEpisodeTime(currentChunkIndex);
        audio.currentTime = targetTime - chunkStartTime;
    } else {
        const { loadChunk } = window.playerChunk || {};
        if (loadChunk) {
            loadChunk(targetChunk.chunk_index).then(() => {
                const chunkStartTime = playerState.calculateEpisodeTime(targetChunk.chunk_index);
                if (audio) {
                    audio.currentTime = targetTime - chunkStartTime;
                }
            });
        }
    }

    $('fs-progress-fill').style.width = `${pct}%`;
}

function initFullscreenSpeedControl() {
    const fsSpeedSelect = document.getElementById('fs-playback-speed');
    if (!fsSpeedSelect) return;

    const savedSpeed = localStorage.getItem('pocket_tts_playback_speed');
    if (savedSpeed) {
        fsSpeedSelect.value = savedSpeed;
        const audio = playerState.getAudio();
        if (audio) {
            audio.playbackRate = parseFloat(savedSpeed);
        }
    }

    fsSpeedSelect.addEventListener('change', (e) => {
        const speed = parseFloat(e.target.value);
        const audio = playerState.getAudio();
        if (audio) {
            audio.playbackRate = speed;
        }
        localStorage.setItem('pocket_tts_playback_speed', speed);

        const miniSpeedSelect = document.getElementById('playback-speed');
        if (miniSpeedSelect) {
            miniSpeedSelect.value = savedSpeed;
        }
    });
}

function initFullscreenVolume() {
    const fsVolumeSlider = document.getElementById('fs-volume-slider');
    const fsMuteBtn = document.getElementById('fs-btn-mute');
    const audio = playerState.getAudio();

    if (fsVolumeSlider && audio) {
        fsVolumeSlider.value = audio.volume;
        fsVolumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (audio) audio.volume = vol;
            localStorage.setItem('pocket_tts_volume', vol);
            const { updateMuteButton } = window.playerControls || {};
            if (updateMuteButton) {
                updateMuteButton(vol > 0, fsMuteBtn);
            }
        });
    }
    if (fsMuteBtn) {
        fsMuteBtn.addEventListener('click', () => {
            const { toggleMute } = window.playerControls || {};
            if (toggleMute) toggleMute(fsMuteBtn);
        });
    }
}

function initFullscreenButtons() {
    $('fs-btn-more').addEventListener('click', () => {
        const episode = playerState.getCurrentEpisode();
        showEpisodeMenu(episode?.id);
    });

    $('fs-btn-skip-back').addEventListener('click', () => {
        const { skip } = window.playerControls || {};
        if (skip) skip(-10);
    });

    $('fs-btn-skip-forward').addEventListener('click', () => {
        const { skip } = window.playerControls || {};
        if (skip) skip(10);
    });

    $('fs-btn-sleep').addEventListener('click', () => {
        showSleepTimerMenu();
    });

    const playlistBtn = document.getElementById('fs-btn-playlist');
    if (playlistBtn) {
        playlistBtn.addEventListener('click', () => {
            showEpisodeListSheet();
        });
    }
}

function handleFullscreenKeydown(e) {
    const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
    if (!isFullscreen) return;

    const { togglePlay, skip } = window.playerControls || {};

    switch (e.key) {
    case 'Escape':
        closeFullscreenPlayer();
        break;
    case ' ':
        e.preventDefault();
        if (togglePlay) togglePlay();
        break;
    case 'ArrowLeft':
        if (skip) skip(-10);
        break;
    case 'ArrowRight':
        if (skip) skip(10);
        break;
    }
}

export function openFullscreenPlayer() {
    const episode = playerState.getCurrentEpisode();
    if (!episode) return;

    playerState.setIsFullscreen(true);
    $('fullscreen-player').classList.remove('hidden');
    updateFullscreenUI();
    document.body.classList.add('fullscreen-player-open');
}

export function closeFullscreenPlayer() {
    playerState.setIsFullscreen(false);
    $('fullscreen-player').classList.add('hidden');
    document.body.classList.remove('fullscreen-player-open');
}

export function updateFullscreenUI() {
    const episode = playerState.getCurrentEpisode();
    if (!episode) return;

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const _idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    $('fs-track-title').textContent = episode.title;
    const episodeInfoEl = document.getElementById('fs-episode-info');
    const totalDuration = playerState.getTotalDuration();
    if (episodeInfoEl) {
        episodeInfoEl.textContent = totalDuration > 0
            ? formatTime(totalDuration)
            : '';
    }

    const audio = playerState.getAudio();
    const isPlaying = audio && !audio.paused;
    $('fs-play-icon').style.display = isPlaying ? 'none' : 'block';
    $('fs-pause-icon').style.display = isPlaying ? 'block' : 'none';

    const indicator = $('fs-playing-indicator');
    if (indicator) {
        indicator.classList.toggle('active', isPlaying);
    }

    updateSubtitles(chunk ? chunk.text : '');

    if (chunk && chunk.text) {
        playerState.setCurrentSubtitleText(chunk.text);
        const sentences = chunk.text.split(/(?<=[.!?])\s+/);
        playerState.setSubtitleSentences(sentences);
        const timings = sentences.map(sentence => {
            const wordCount = sentence.split(/\s+/).length;
            return wordCount / 2.5;
        });
        playerState.setSubtitleTimings(timings);
    } else {
        playerState.setCurrentSubtitleText('');
        playerState.setSubtitleSentences([]);
        playerState.setSubtitleTimings([]);
    }

    const currentTime = playerState.getCurrentTime();
    if (totalDuration > 0) {
        $('fs-time-current').textContent = formatTime(currentTime);
        const remaining = totalDuration - currentTime;
        const fsTimeRemaining = document.getElementById('fs-time-remaining');
        if (fsTimeRemaining) {
            fsTimeRemaining.textContent = `-${formatTime(remaining)}`;
        }
        const pct = (currentTime / totalDuration) * 100;
        $('fs-scrubber').value = pct;
        $('fs-progress-fill').style.width = `${pct}%`;
    }
}

export function updateSubtitles(text) {
    const subtitleEl = $('fs-subtitle-text');
    if (!subtitleEl) return;

    if (!text) {
        subtitleEl.textContent = 'No subtitle available';
        return;
    }

    const sentences = text.split(/(?<=[.!?])\s+/);
    subtitleEl.textContent = sentences[0] || text;
}

export function updateSubtitlesSync() {
    const audio = playerState.getAudio();
    const currentSubtitleText = playerState.getCurrentSubtitleText();
    if (!audio || !audio.duration || !currentSubtitleText) return;

    const subtitleTimings = playerState.getSubtitleTimings();
    const subtitleSentences = playerState.getSubtitleSentences();

    const currentTime = audio.currentTime;
    let elapsedTime = 0;
    let currentSentenceIndex = 0;

    for (let i = 0; i < subtitleTimings.length; i++) {
        if (currentTime < elapsedTime + subtitleTimings[i]) {
            currentSentenceIndex = i;
            break;
        }
        elapsedTime += subtitleTimings[i];
        currentSentenceIndex = i;
    }

    const subtitleEl = $('fs-subtitle-text');
    if (subtitleEl && subtitleSentences[currentSentenceIndex]) {
        subtitleEl.textContent = subtitleSentences[currentSentenceIndex];
    }
}

export function updateCoverArt() {
    const coverImage = $('fs-cover-image');
    const coverPlaceholder = $('fs-cover-placeholder');
    const episode = playerState.getCurrentEpisode();

    if (!episode) return;

    const sourceId = episode.source_id;
    if (sourceId) {
        const coverUrl = `/api/studio/sources/${sourceId}/cover`;
        coverImage.src = coverUrl;
        coverImage.onload = () => {
            coverImage.classList.remove('hidden');
            coverPlaceholder.classList.add('hidden');
        };
        coverImage.onerror = () => {
            coverImage.classList.add('hidden');
            coverPlaceholder.classList.remove('hidden');
        };
    }
}

export function showPlayer() {
    const playerBar = $('player-bar');
    playerBar.style.display = 'block';
    playerBar.style.animation = 'slideUp 0.4s ease';

    const { drawWaveform, startWaveformAnimation } = window.playerWaveform || {};
    setTimeout(() => {
        if (drawWaveform) drawWaveform();
        if (startWaveformAnimation) startWaveformAnimation();
    }, 100);
}

export function updatePlayerUI() {
    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    $('player-chunk-label').textContent = chunk ? chunk.text.substring(0, 60) + '...' : '';
    $('player-chunk-num').textContent = `${idx + 1} / ${chunks.length}`;

    const { updatePlayPauseIcon } = window.playerControls || {};
    const audio = playerState.getAudio();
    if (updatePlayPauseIcon) {
        updatePlayPauseIcon(!audio?.paused);
    }

    document.querySelectorAll('.chunk-card').forEach(el => el.classList.remove('playing'));
    const playingCard = document.querySelector(`.chunk-card[data-index="${currentChunkIndex}"]`);
    if (playingCard) playingCard.classList.add('playing');

    updateMediaSession();
}

export function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const episode = playerState.getCurrentEpisode();
    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    navigator.mediaSession.metadata = new MediaMetadata({
        title: episode?.title || 'Podcast',
        artist: chunk ? chunk.text.substring(0, 100) : 'OpenVox',
        album: `Part ${idx + 1} of ${chunks.length}`,
        artwork: [
            {
                src: '/static/img/podcast-placeholder.svg',
                sizes: '512x512',
                type: 'image/svg+xml'
            }
        ]
    });

    const audio = playerState.getAudio();
    if (audio && audio.duration) {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
        });
    }
}

export function updateNowPlayingView() {
    const episode = playerState.getCurrentEpisode();
    const chunks = playerState.getChunks();
    if (!episode || !chunks.length) return;

    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const _idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    const titleEl = document.getElementById('now-playing-title');
    const chunkEl = document.getElementById('now-playing-chunk');
    const indicator = document.getElementById('playing-indicator');
    const audio = playerState.getAudio();

    if (titleEl) titleEl.textContent = episode.title;
    if (chunkEl) chunkEl.textContent = chunk ? chunk.text.substring(0, 120) + '...' : '';
    if (indicator) {
        if (audio && !audio.paused) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }

    const { renderQueue } = window.playerQueue || {};
    if (renderQueue) renderQueue();
}

export function updateTimeDisplays() {
    const audio = playerState.getAudio();
    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const totalDuration = playerState.getTotalDuration();
    const _currentTime = playerState.getCurrentTime();

    if (!audio || !audio.duration) return;

    const _currentChunkDuration = chunks.find(c => c.chunk_index === currentChunkIndex)?.duration_secs || 0;
    const chunkStartTime = playerState.calculateEpisodeTime(currentChunkIndex);
    playerState.setCurrentTime(chunkStartTime + audio.currentTime);

    const episodeProgress = playerState.calculateEpisodeProgress();

    const chunkPct = (audio.currentTime / audio.duration) * 100;
    $('player-scrubber').value = chunkPct;
    document.getElementById('scrubber-fill').style.width = `${chunkPct}%`;
    $('player-time-current').textContent = formatTime(audio.currentTime);

    const nowPlayingProgress = document.getElementById('now-playing-progress');
    const nowPlayingCurrent = document.getElementById('now-playing-current');
    const nowPlayingTotal = document.getElementById('now-playing-total');

    if (nowPlayingProgress) nowPlayingProgress.style.width = `${episodeProgress}%`;
    if (nowPlayingCurrent) nowPlayingCurrent.textContent = formatTime(playerState.getCurrentTime());
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(totalDuration);

    const fsTimeCurrent = document.getElementById('fs-time-current');
    const fsTimeRemaining = document.getElementById('fs-time-remaining');
    const fsScrubber = document.getElementById('fs-scrubber');
    const fsProgressFill = document.getElementById('fs-progress-fill');

    if (fsTimeCurrent) fsTimeCurrent.textContent = formatTime(playerState.getCurrentTime());
    if (fsTimeRemaining) {
        const remaining = totalDuration - playerState.getCurrentTime();
        fsTimeRemaining.textContent = `-${formatTime(remaining)}`;
    }
    if (fsScrubber) fsScrubber.value = episodeProgress;
    if (fsProgressFill) fsProgressFill.style.width = `${episodeProgress}%`;

    updateSubtitlesSync();
}

export function updateMetadataDisplay() {
    const audio = playerState.getAudio();
    const totalDuration = playerState.getTotalDuration();

    $('player-time-total').textContent = formatTime(audio?.duration || 0);
    $('player-scrubber').value = 0;
    document.getElementById('scrubber-fill').style.width = '0%';

    const nowPlayingTotal = document.getElementById('now-playing-total');
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(totalDuration);

    const fsTimeTotal = document.getElementById('fs-time-total');
    const fsTimeRemaining = document.getElementById('fs-time-remaining');
    if (fsTimeTotal) fsTimeTotal.textContent = formatTime(totalDuration);
    if (fsTimeRemaining) {
        const remaining = totalDuration - playerState.getCurrentTime();
        fsTimeRemaining.textContent = `-${formatTime(remaining)}`;
    }
}

function showEpisodeMenu(episodeId) {
    if (!episodeId) return;

    window.openBottomSheet('Episode Actions', [
        {
            label: 'Go to Episode',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
            action: () => { window.location.hash = `#episode/${episodeId}`; }
        },
        { sep: true },
        {
            label: 'Download Full Episode',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            action: () => { window.location.href = api.fullEpisodeAudioUrl(episodeId); }
        },
        {
            label: 'Regenerate Audio',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
            action: async () => {
                try {
                    await api.postApiStudioEpisodesEpisodeIdRegenerate(episodeId);
                    toast('Episode regeneration started', 'info');
                } catch (_) {
                    toast('Failed to start regeneration', 'error');
                }
            }
        },
    ]);
}

async function showEpisodeListSheet() {
    const sheet = document.getElementById('bottom-sheet');
    const overlay = document.getElementById('bottom-sheet-overlay');
    const title = document.getElementById('bottom-sheet-title');
    const content = document.getElementById('bottom-sheet-content');

    if (!sheet || !overlay || !title || !content) return;

    title.textContent = 'Episodes';
    content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">Loading...</p>';
    overlay.classList.remove('hidden');

    try {
        const library = await api.getApiStudioLibraryTree();
        const episodes = library.episodes || [];
        const currentEpisode = playerState.getCurrentEpisode();

        content.innerHTML = '';

        if (!episodes.length) {
            content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No episodes yet</p>';
        } else {
            episodes.forEach(episode => {
                const isCurrent = episode.id === currentEpisode?.id;
                const item = document.createElement('button');
                item.className = `bottom-sheet_action ${isCurrent ? 'active' : ''}`;
                item.innerHTML = `
                    <span class="queue-text">${episode.title}</span>
                    <span class="queue-duration">${episode.total_duration_secs ? formatTime(episode.total_duration_secs) : ''}</span>
                `;
                item.addEventListener('click', () => {
                    closeBottomSheet();
                    const { loadEpisode } = window.playerChunk || {};
                    if (loadEpisode) {
                        loadEpisode(episode.id);
                    }
                });
                content.appendChild(item);
            });
        }
    } catch (_e) {
        content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">Failed to load episodes</p>';
    }

    sheet.scrollTop = 0;
}

function closeBottomSheet() {
    const overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

let sleepTimerId = null;
let sleepTimerRemaining = 0;

export function showSleepTimerMenu() {
    const options = [
        { label: '15 minutes', value: 15 * 60 },
        { label: '30 minutes', value: 30 * 60 },
        { label: '45 minutes', value: 45 * 60 },
        { label: '1 hour', value: 60 * 60 },
        { label: 'End of chapter', value: -1 },
    ];

    const actions = options.map(opt => ({
        label: opt.label,
        action: () => setSleepTimer(opt.value),
    }));

    if (sleepTimerId) {
        actions.push({ sep: true });
        actions.push({
            label: 'Cancel timer',
            danger: true,
            action: cancelSleepTimer,
        });
    }

    window.openBottomSheet('Sleep Timer', actions);
}

export function setSleepTimer(seconds) {
    cancelSleepTimer();

    const audio = playerState.getAudio();
    if (seconds === -1) {
        if (audio && audio.duration) {
            seconds = Math.ceil(audio.duration - audio.currentTime);
        } else {
            toast('No audio playing', 'error');
            return;
        }
    }

    sleepTimerRemaining = seconds;
    updateSleepTimerUI();

    sleepTimerId = setInterval(() => {
        sleepTimerRemaining--;
        updateSleepTimerUI();

        if (sleepTimerRemaining <= 0) {
            cancelSleepTimer();
            audio?.pause();
            const { savePosition } = window.playerControls || {};
            if (savePosition) savePosition();
            triggerHaptic('success');
            toast('Sleep timer ended', 'info');
        }
    }, 1000);

    toast(`Sleep timer: ${formatTime(seconds)}`, 'info');
    triggerHaptic('medium');
}

function cancelSleepTimer() {
    if (sleepTimerId) {
        clearInterval(sleepTimerId);
        sleepTimerId = null;
        sleepTimerRemaining = 0;
        updateSleepTimerUI();
    }
}

function updateSleepTimerUI() {
    const timerEl = document.getElementById('sleep-timer-indicator');
    if (timerEl) {
        if (sleepTimerRemaining > 0) {
            timerEl.textContent = formatTime(sleepTimerRemaining);
            timerEl.classList.add('active');
        } else {
            timerEl.textContent = '';
            timerEl.classList.remove('active');
        }
    }
}
