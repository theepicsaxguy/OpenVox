/**
 * Player rendering functions - mini player, fullscreen player, UI updates
 */

import { client as api, fullEpisodeAudioUrl } from './api.js';
import { toast } from './main.js';
import { $, formatTime, triggerHaptic } from './utils.js';
import * as playerState from './player-state.js';

const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function initFullscreenPlayer() {
    const fullscreenPlayer = $('fullscreen-player');
    if (!fullscreenPlayer) return;

    $('fs-btn-minimize').addEventListener('click', closeFullscreenPlayer);

    $('fs-btn-play')?.addEventListener('click', () => {
        const { togglePlay } = window.playerControls || {};
        if (togglePlay) togglePlay();
    });

    $('fs-scrubber')?.addEventListener('input', handleFullscreenSeek);

    initSpeedPill();
    initFullscreenVolume();
    initFullscreenButtons();
    initMiniPlayerTap();

    document.addEventListener('keydown', handleFullscreenKeydown);
}

function initMiniPlayerTap() {
    const tapTarget = $('mini-player-tap-target');
    if (!tapTarget) return;

    tapTarget.addEventListener('click', (e) => {
        if (e.target.closest('.mini-ctrl-btn')) return;
        openFullscreenPlayer();
    });
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

function initSpeedPill() {
    const pill = $('fs-speed-pill');
    if (!pill) return;

    const saved = localStorage.getItem('pocket_tts_playback_speed');
    if (saved) {
        updateSpeedPillUI(parseFloat(saved));
    }

    pill.addEventListener('click', () => {
        const audio = playerState.getAudio();
        const current = audio ? audio.playbackRate : 1;
        const idx = SPEED_STEPS.indexOf(current);
        const next = idx >= 0 && idx < SPEED_STEPS.length - 1
            ? SPEED_STEPS[idx + 1]
            : SPEED_STEPS[0];

        if (audio) audio.playbackRate = next;
        localStorage.setItem('pocket_tts_playback_speed', next);

        updateSpeedPillUI(next);

        const miniSpeed = $('playback-speed');
        if (miniSpeed) miniSpeed.value = next.toString();

        triggerHaptic('light');
    });
}

function updateSpeedPillUI(speed) {
    const pill = $('fs-speed-pill');
    const label = $('fs-speed-label');
    if (!pill || !label) return;

    const display = speed % 1 === 0 ? `${speed}x` : `${speed}x`;
    label.textContent = display;

    pill.classList.toggle('speed-modified', speed !== 1);
}

function initFullscreenVolume() {
    const fsVolumeSlider = $('fs-volume-slider');
    const fsMuteBtn = $('fs-btn-mute');

    if (fsVolumeSlider) {
        fsVolumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            const audio = playerState.getAudio();
            if (audio) audio.volume = vol;
            localStorage.setItem('pocket_tts_volume', vol);
            const { updateMuteButton } = window.playerControls || {};
            if (updateMuteButton) updateMuteButton(vol > 0, fsMuteBtn);
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
    $('fs-btn-more')?.addEventListener('click', () => {
        const episode = playerState.getCurrentEpisode();
        showEpisodeMenu(episode?.id);
    });

    $('fs-btn-skip-back')?.addEventListener('click', () => {
        const { skip } = window.playerControls || {};
        if (skip) skip(-10);
    });

    $('fs-btn-skip-forward')?.addEventListener('click', () => {
        const { skip } = window.playerControls || {};
        if (skip) skip(10);
    });

    $('fs-btn-prev')?.addEventListener('click', () => {
        const { prevChunk } = window.playerControls || {};
        if (prevChunk) prevChunk();
    });

    $('fs-btn-next')?.addEventListener('click', () => {
        const { nextChunk } = window.playerControls || {};
        if (nextChunk) nextChunk();
    });

    $('fs-btn-sleep')?.addEventListener('click', () => {
        showSleepTimerMenu();
    });

    $('fs-btn-playlist')?.addEventListener('click', () => {
        showEpisodeListSheet();
    });

    $('fs-btn-download')?.addEventListener('click', () => {
        const episode = playerState.getCurrentEpisode();
        if (episode) {
            window.open(fullEpisodeAudioUrl(episode.id), '_blank');
        }
    });
}

function handleFullscreenKeydown(e) {
    const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
    if (!isFullscreen) return;

    const { togglePlay, skip, prevChunk, nextChunk } = window.playerControls || {};

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
    case 'n':
    case 'N':
        if (nextChunk) nextChunk();
        break;
    case 'p':
    case 'P':
        if (prevChunk) prevChunk();
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

    const saved = localStorage.getItem('pocket_tts_playback_speed');
    if (saved) updateSpeedPillUI(parseFloat(saved));

    const audio = playerState.getAudio();
    const volumeSlider = $('fs-volume-slider');
    if (audio && volumeSlider) volumeSlider.value = audio.volume;
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
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    const titleEl = $('fs-track-title');
    if (titleEl) titleEl.textContent = episode.title;

    const totalDuration = playerState.getTotalDuration();
    const episodeInfoEl = $('fs-episode-info');
    if (episodeInfoEl) {
        episodeInfoEl.textContent = totalDuration > 0
            ? `Part ${idx + 1} of ${chunks.length} · ${formatTime(totalDuration)}`
            : '';
    }

    const chunkLabel = $('fs-chunk-label');
    if (chunkLabel) {
        chunkLabel.textContent = chunks.length > 1
            ? `Part ${idx + 1} of ${chunks.length}`
            : '';
    }

    const audio = playerState.getAudio();
    const isPlaying = audio && !audio.paused;
    const playIcon = $('fs-play-icon');
    const pauseIcon = $('fs-pause-icon');
    if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';

    updateSubtitleDisplay(chunk);
    renderChunkSegments();

    const currentTime = playerState.getCurrentTime();
    if (totalDuration > 0) {
        const tCurr = $('fs-time-current');
        const tRem = $('fs-time-remaining');
        if (tCurr) tCurr.textContent = formatTime(currentTime);
        const remaining = totalDuration - currentTime;
        if (tRem) tRem.textContent = `-${formatTime(remaining)}`;
        const pct = (currentTime / totalDuration) * 100;
        const scrub = $('fs-scrubber');
        if (scrub) scrub.value = pct;
        const fill = $('fs-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
    }
}

function renderChunkSegments() {
    const container = $('fs-chunk-segments');
    if (!container) return;

    const chunks = playerState.getChunks();
    const totalDuration = playerState.getTotalDuration();
    if (!chunks.length || !totalDuration) {
        container.innerHTML = '';
        return;
    }

    if (container.dataset.chunkCount === String(chunks.length)) return;
    container.dataset.chunkCount = String(chunks.length);

    let html = '';
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        const dur = chunks[i].duration_secs || 0;
        const leftPct = (offset / totalDuration) * 100;
        const widthPct = (dur / totalDuration) * 100;
        if (i > 0) {
            html += `<div class="fs-chunk-divider" style="left:${leftPct}%"></div>`;
        }
        html += `<div class="fs-chunk-seg" data-chunk="${i}" style="left:${leftPct}%;width:${widthPct}%" title="Part ${i + 1}"></div>`;
        offset += dur;
    }
    container.innerHTML = html;

    container.querySelectorAll('.fs-chunk-seg').forEach(seg => {
        seg.addEventListener('click', () => {
            const chunkIdx = parseInt(seg.dataset.chunk, 10);
            const chunk = chunks[chunkIdx];
            if (chunk) {
                const { loadChunk } = window.playerChunk || {};
                if (loadChunk) {
                    loadChunk(chunk.chunk_index).then(() => {
                        const audio = playerState.getAudio();
                        if (audio) audio.play().catch(() => {});
                    });
                }
            }
        });
    });
}

function updateSubtitleDisplay(chunk) {
    if (chunk && chunk.text) {
        playerState.setCurrentSubtitleText(chunk.text);
        const sentences = chunk.text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        playerState.setSubtitleSentences(sentences);
        const timings = sentences.map(s => {
            const wordCount = s.split(/\s+/).length;
            return wordCount / 2.5;
        });
        playerState.setSubtitleTimings(timings);
        renderKaraoke(sentences, 0, -1);
    } else {
        playerState.setCurrentSubtitleText('');
        playerState.setSubtitleSentences([]);
        playerState.setSubtitleTimings([]);
        renderKaraokeIdle('Waiting for audio...');
    }
}

function escapeForSubtitle(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderKaraokeIdle(message) {
    const el = $('fs-subtitle-text');
    if (!el) return;
    const words = message.split(/\s+/);
    el.innerHTML = words.map(w =>
        `<span class="karaoke-word spoken">${escapeForSubtitle(w)}</span>`
    ).join(' ');
}

function renderKaraoke(sentences, sentenceIndex, wordIndex) {
    const el = $('fs-subtitle-text');
    if (!el || !sentences.length) return;

    const sentence = sentences[Math.min(sentenceIndex, sentences.length - 1)];
    if (!sentence) return;

    const words = sentence.split(/\s+/);
    const html = words.map((word, i) => {
        let cls = 'karaoke-word';
        if (i < wordIndex) cls += ' spoken';
        else if (i === wordIndex) cls += ' active';
        return `<span class="${cls}">${escapeForSubtitle(word)}</span>`;
    }).join(' ');

    el.innerHTML = html;
}

export function updateSubtitles(text) {
    const subtitleEl = $('fs-subtitle-text');
    if (!subtitleEl) return;
    if (!text) {
        renderKaraokeIdle('No subtitle available');
        return;
    }
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    renderKaraoke(sentences, 0, -1);
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

    const sentence = subtitleSentences[currentSentenceIndex];
    if (!sentence) return;

    const sentenceStart = subtitleTimings.slice(0, currentSentenceIndex).reduce((a, b) => a + b, 0);
    const sentenceDuration = subtitleTimings[currentSentenceIndex] || 1;
    const timeInSentence = currentTime - sentenceStart;
    const progress = Math.max(0, Math.min(1, timeInSentence / sentenceDuration));

    const words = sentence.split(/\s+/);
    const activeWordIndex = Math.floor(progress * words.length);

    renderKaraoke(subtitleSentences, currentSentenceIndex, activeWordIndex);
}

export function updateCoverArt() {
    const coverImage = $('fs-cover-image');
    const episode = playerState.getCurrentEpisode();

    if (!episode || !coverImage) return;

    const sourceId = episode.source_id;
    if (sourceId) {
        coverImage.src = `/api/studio/sources/${sourceId}/cover`;
    }
}

export function showPlayer() {
    const playerBar = $('player-bar');
    if (!playerBar) return;
    playerBar.classList.remove('hidden');
    playerBar.style.display = 'block';

    document.querySelector('.app-shell')?.classList.add('has-player');

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

    const titleEl = $('player-title');
    const episode = playerState.getCurrentEpisode();
    if (titleEl && episode) titleEl.textContent = episode.title;

    const chunkLabel = $('player-chunk-label');
    if (chunkLabel) {
        chunkLabel.textContent = chunk
            ? `Part ${idx + 1}/${chunks.length} · ${chunk.text.substring(0, 50)}...`
            : '';
    }

    const numEl = $('player-chunk-num');
    if (numEl) numEl.textContent = `${idx + 1} / ${chunks.length}`;

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
        title: episode?.title || 'OpenVox',
        artist: chunk ? chunk.text.substring(0, 100) : 'OpenVox',
        album: `Part ${idx + 1} of ${chunks.length}`,
    });

    const audio = playerState.getAudio();
    if (audio && audio.duration) {
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: audio.currentTime,
            });
        } catch (_) {}
    }
}

export function updateNowPlayingView() {
    const episode = playerState.getCurrentEpisode();
    const chunks = playerState.getChunks();
    if (!episode || !chunks.length) return;

    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const indicator = document.getElementById('playing-indicator');
    const audio = playerState.getAudio();

    const titleEl = document.getElementById('now-playing-title');
    const chunkEl = document.getElementById('now-playing-chunk');

    if (titleEl) titleEl.textContent = episode.title;
    if (chunkEl) chunkEl.textContent = chunk ? chunk.text.substring(0, 120) + '...' : '';
    if (indicator) {
        indicator.classList.toggle('active', !!(audio && !audio.paused));
    }

    const { renderQueue } = window.playerQueue || {};
    if (renderQueue) renderQueue();
}

export function updateTimeDisplays() {
    const audio = playerState.getAudio();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const totalDuration = playerState.getTotalDuration();

    if (!audio || !audio.duration) return;

    const chunkStartTime = playerState.calculateEpisodeTime(currentChunkIndex);
    playerState.setCurrentTime(chunkStartTime + audio.currentTime);

    const episodeProgress = playerState.calculateEpisodeProgress();

    // Mini player progress
    const scrubberFill = document.getElementById('scrubber-fill');
    if (scrubberFill) scrubberFill.style.width = `${episodeProgress}%`;

    const scrubber = $('player-scrubber');
    if (scrubber) scrubber.value = episodeProgress;

    const timeCurrent = $('player-time-current');
    if (timeCurrent) timeCurrent.textContent = formatTime(audio.currentTime);

    // Now Playing view
    const nowPlayingProgress = document.getElementById('now-playing-progress');
    const nowPlayingCurrent = document.getElementById('now-playing-current');
    const nowPlayingTotal = document.getElementById('now-playing-total');

    if (nowPlayingProgress) nowPlayingProgress.style.width = `${episodeProgress}%`;
    if (nowPlayingCurrent) nowPlayingCurrent.textContent = formatTime(playerState.getCurrentTime());
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(totalDuration);

    // Fullscreen player
    const fsTimeCurrent = $('fs-time-current');
    const fsTimeRemaining = $('fs-time-remaining');
    const fsScrubber = $('fs-scrubber');
    const fsProgressFill = $('fs-progress-fill');

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

    const timeTotal = $('player-time-total');
    if (timeTotal) timeTotal.textContent = formatTime(audio?.duration || 0);

    const scrubber = $('player-scrubber');
    if (scrubber) scrubber.value = 0;

    const fill = document.getElementById('scrubber-fill');
    if (fill) fill.style.width = '0%';

    const nowPlayingTotal = document.getElementById('now-playing-total');
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(totalDuration);

    const fsTimeRemaining = $('fs-time-remaining');
    if (fsTimeRemaining) {
        const remaining = totalDuration - playerState.getCurrentTime();
        fsTimeRemaining.textContent = `-${formatTime(remaining)}`;
    }
}

function showEpisodeMenu(episodeId) {
    if (!episodeId) return;

    window.openBottomSheet?.('Episode Actions', [
        {
            label: 'Go to Episode',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
            action: () => { window.location.hash = `#episode/${episodeId}`; }
        },
        { sep: true },
        {
            label: 'Download Full Episode',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            action: () => { window.location.href = fullEpisodeAudioUrl(episodeId); }
        },
        {
            label: 'Regenerate Audio',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
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
    const content = document.getElementById('bottom-sheet-content');
    if (!content) return;

    window.openBottomSheet?.('Episodes', []);

    content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">Loading...</p>';

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
                item.className = `bottom-sheet-action ${isCurrent ? 'active' : ''}`;
                item.innerHTML = `
                    <span>${escapeForSubtitle(episode.title)}</span>
                    <span style="font-size:0.8rem;color:var(--text-muted)">${episode.total_duration_secs ? formatTime(episode.total_duration_secs) : ''}</span>
                `;
                item.addEventListener('click', () => {
                    window.closeBottomSheet?.();
                    const { loadEpisode } = window.playerChunk || {};
                    if (loadEpisode) loadEpisode(episode.id);
                });
                content.appendChild(item);
            });
        }
    } catch (_) {
        content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">Failed to load episodes</p>';
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

    window.openBottomSheet?.('Sleep Timer', actions);
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
