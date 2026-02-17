/**
 * Audio player — chunk-based playback with auto-advance and waveform visualization.
 * Premium Edition
 */

import * as api from './api.js';
import * as state from './state.js';
import { toast } from './main.js';

let audio = null;
let currentEpisode = null;
let currentChunkIndex = 0;
let chunks = [];
let saveTimer = null;
let waveformAnimationId = null;

const $ = (id) => document.getElementById(id);

// ── Public API ──────────────────────────────────────────────────────

export async function loadEpisode(episodeId, startChunk = null) {
    try {
        const episode = await api.getEpisode(episodeId);
        currentEpisode = episode;
        chunks = (episode.chunks || []).filter(c => c.status === 'ready');

        if (!chunks.length) {
            toast('No ready chunks to play', 'error');
            return;
        }

        // Restore playback position or use provided startChunk
        if (startChunk !== null) {
            currentChunkIndex = startChunk;
        } else if (episode.current_chunk_index != null) {
            currentChunkIndex = episode.current_chunk_index;
        } else {
            currentChunkIndex = 0;
        }

        // Ensure index is valid
        const validIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
        if (validIdx < 0) currentChunkIndex = chunks[0].chunk_index;

        showPlayer();
        $('player-title').textContent = episode.title;
        await loadChunk(currentChunkIndex);

        // Auto-play
        try { 
            await audio.play(); 
            startWaveformAnimation();
        } catch {}

        // Restore position within chunk
        if (startChunk === null && episode.position_secs) {
            audio.currentTime = episode.position_secs;
        }

        // Update Now Playing view if visible
        updateNowPlayingView();

    } catch (e) {
        toast(`Player error: ${e.message}`, 'error');
    }
}

// ── Now Playing View ────────────────────────────────────────────────

function updateNowPlayingView() {
    if (!currentEpisode || !chunks.length) return;
    
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    
    // Update current track info
    const titleEl = document.getElementById('now-playing-title');
    const chunkEl = document.getElementById('now-playing-chunk');
    const indicator = document.getElementById('playing-indicator');
    
    if (titleEl) titleEl.textContent = currentEpisode.title;
    if (chunkEl) chunkEl.textContent = chunk ? chunk.text.substring(0, 120) + '...' : '';
    if (indicator) {
        if (audio && !audio.paused) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
    
    // Update queue
    renderQueue();
}

function renderQueue() {
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');
    if (!queueList) return;
    
    const currentIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    const remaining = chunks.length - currentIdx - 1;
    
    if (queueCount) {
        queueCount.textContent = remaining === 0 ? 'No chunks remaining' : `${remaining} chunk${remaining !== 1 ? 's' : ''} remaining`;
    }
    
    queueList.innerHTML = '';
    
    // Show all chunks with current one highlighted
    chunks.forEach((chunk, idx) => {
        const isCurrent = idx === currentIdx;
        const isPast = idx < currentIdx;
        
        const item = document.createElement('div');
        item.className = `queue-item ${isCurrent ? 'current' : ''} ${isPast ? 'played' : ''}`;
        item.innerHTML = `
            <span class="queue-item-num">${idx + 1}</span>
            <span class="queue-item-text">${chunk.text.substring(0, 60)}${chunk.text.length > 60 ? '...' : ''}</span>
            <span class="queue-item-duration">${chunk.duration_secs ? formatTime(chunk.duration_secs) : ''}</span>
        `;
        
        item.addEventListener('click', () => {
            savePosition();
            loadChunk(chunk.chunk_index);
            if (audio) audio.play().catch(() => {});
        });
        
        queueList.appendChild(item);
    });
    
    // Scroll current item into view
    const currentItem = queueList.querySelector('.queue-item.current');
    if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ── Waveform Visualization ──────────────────────────────────────────
// Simplified visualization - just a subtle animated line

let waveformBars = [];

function initWaveformBars() {
    // Pre-generate random heights for smooth animation
    waveformBars = [];
    for (let i = 0; i < 30; i++) {
        waveformBars.push({
            baseHeight: 10 + Math.random() * 20,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function drawWaveform() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Only resize if needed
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }
    
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const isPlaying = audio && !audio.paused;
    const time = Date.now() / 1000;
    const barCount = 30;
    const barWidth = 3;
    const gap = (width - barCount * barWidth) / (barCount - 1);
    const centerY = height / 2;
    
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
    
    for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        const bar = waveformBars[i] || { baseHeight: 15, phase: 0 };
        
        let barHeight = bar.baseHeight;
        
        if (isPlaying) {
            // Smooth sine wave animation
            barHeight = bar.baseHeight + Math.sin(time * 4 + bar.phase) * 8;
            barHeight = Math.max(4, Math.min(barHeight, height * 0.6));
        }
        
        // Simple fill rect instead of gradient for performance
        ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
}

function startWaveformAnimation() {
    if (waveformAnimationId) cancelAnimationFrame(waveformAnimationId);
    
    let lastDraw = 0;
    function animate(timestamp) {
        // Limit to 30fps for performance
        if (timestamp - lastDraw >= 33) {
            drawWaveform();
            lastDraw = timestamp;
        }
        waveformAnimationId = requestAnimationFrame(animate);
    }
    animate(0);
}

function stopWaveformAnimation() {
    if (waveformAnimationId) {
        cancelAnimationFrame(waveformAnimationId);
        waveformAnimationId = null;
    }
}

// ── Internals ───────────────────────────────────────────────────────

async function loadChunk(chunkIndex) {
    currentChunkIndex = chunkIndex;
    state.set('playingEpisodeId', currentEpisode.id);
    state.set('playingChunkIndex', chunkIndex);

    const chunk = chunks.find(c => c.chunk_index === chunkIndex);
    if (!chunk) return;

    const url = api.chunkAudioUrl(currentEpisode.id, chunkIndex);

    if (!audio) {
        audio = new Audio();
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('loadedmetadata', onMetadataLoaded);
        audio.addEventListener('play', () => {
            updatePlayPauseIcon(true);
            startWaveformAnimation();
            updateNowPlayingView();
        });
        audio.addEventListener('pause', () => {
            updatePlayPauseIcon(false);
            stopWaveformAnimation();
            drawWaveform();
            savePosition();
            updateNowPlayingView();
        });
    }

    audio.src = url;
    audio.load();

    updatePlayerUI();
    updateNowPlayingView();
}

function onTimeUpdate() {
    if (!audio || !audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('player-scrubber').value = pct;
    document.getElementById('scrubber-fill').style.width = `${pct}%`;
    $('player-time-current').textContent = formatTime(audio.currentTime);
    
    // Update Now Playing progress
    const nowPlayingProgress = document.getElementById('now-playing-progress');
    const nowPlayingCurrent = document.getElementById('now-playing-current');
    const nowPlayingTotal = document.getElementById('now-playing-total');
    
    if (nowPlayingProgress) nowPlayingProgress.style.width = `${pct}%`;
    if (nowPlayingCurrent) nowPlayingCurrent.textContent = formatTime(audio.currentTime);
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(audio.duration);
}

function onMetadataLoaded() {
    $('player-time-total').textContent = formatTime(audio.duration);
    $('player-scrubber').value = 0;
    document.getElementById('scrubber-fill').style.width = '0%';
    
    const nowPlayingTotal = document.getElementById('now-playing-total');
    if (nowPlayingTotal) nowPlayingTotal.textContent = formatTime(audio.duration);
}

function onEnded() {
    // Auto-advance to next chunk
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    if (idx >= 0 && idx < chunks.length - 1) {
        const next = chunks[idx + 1];
        loadChunk(next.chunk_index);
        audio.play().catch(() => {});
    } else {
        // Episode finished
        savePosition(100);
        updatePlayPauseIcon(false);
        stopWaveformAnimation();
        drawWaveform();
        updateNowPlayingView();
    }
}

function updatePlayerUI() {
    const chunk = chunks.find(c => c.chunk_index === currentChunkIndex);
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);

    $('player-chunk-label').textContent = chunk ? chunk.text.substring(0, 60) + '...' : '';
    $('player-chunk-num').textContent = `${idx + 1} / ${chunks.length}`;

    updatePlayPauseIcon(!audio.paused);

    // Update episode view highlighting
    document.querySelectorAll('.chunk-card').forEach(el => el.classList.remove('playing'));
    const playingCard = document.querySelector(`.chunk-card[data-index="${currentChunkIndex}"]`);
    if (playingCard) playingCard.classList.add('playing');
}

function updatePlayPauseIcon(playing) {
    $('play-icon').style.display = playing ? 'none' : 'block';
    $('pause-icon').style.display = playing ? 'block' : 'none';
    
    const btn = $('player-play');
    if (playing) {
        btn.classList.add('playing');
    } else {
        btn.classList.remove('playing');
    }
}

function showPlayer() {
    const playerBar = $('player-bar');
    playerBar.style.display = 'block';
    playerBar.style.animation = 'slideUp 0.4s ease';
    
    // Initialize waveform
    setTimeout(() => {
        drawWaveform();
        startWaveformAnimation();
    }, 100);
}

// Add slide up animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

function formatTime(secs) {
    if (!secs || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Playback position persistence ───────────────────────────────────

function savePosition(forcePct) {
    if (!currentEpisode) return;

    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    const totalChunks = chunks.length;
    let pct = forcePct;
    if (pct == null) {
        const chunkPct = (audio && audio.duration)
            ? (audio.currentTime / audio.duration)
            : 0;
        pct = totalChunks > 0
            ? ((idx + chunkPct) / totalChunks) * 100
            : 0;
    }

    api.savePlayback(currentEpisode.id, {
        current_chunk_index: currentChunkIndex,
        position_secs: audio ? audio.currentTime : 0,
        percent_listened: Math.min(100, pct),
    }).catch(() => {});
}

function startPeriodicSave() {
    clearInterval(saveTimer);
    saveTimer = setInterval(() => savePosition(), 30000);
}

// ── Controls ────────────────────────────────────────────────────────

function togglePlay() {
    if (!audio) return;
    if (audio.paused) {
        audio.play().catch(() => {});
    } else {
        audio.pause();
        savePosition();
    }
    updatePlayPauseIcon(!audio.paused);
}

function skip(secs) {
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + secs));
}

function prevChunk() {
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    if (idx > 0) {
        savePosition();
        loadChunk(chunks[idx - 1].chunk_index);
        audio.play().catch(() => {});
    }
}

function nextChunk() {
    const idx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    if (idx >= 0 && idx < chunks.length - 1) {
        savePosition();
        loadChunk(chunks[idx + 1].chunk_index);
        audio.play().catch(() => {});
    }
}

function showQueue() {
    window.location.hash = '#now-playing';
}

// ── Init ────────────────────────────────────────────────────────────

export function init() {
    // Initialize waveform
    initWaveformBars();
    
    // Handle resize with debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            initWaveformBars();
            drawWaveform();
        }, 100);
    });
    
    // Initial draw
    setTimeout(drawWaveform, 100);

    $('player-play').addEventListener('click', togglePlay);
    $('player-skip-back').addEventListener('click', () => skip(-10));
    $('player-skip-fwd').addEventListener('click', () => skip(10));
    $('player-prev').addEventListener('click', prevChunk);
    $('player-next').addEventListener('click', nextChunk);

    $('player-scrubber').addEventListener('input', (e) => {
        if (!audio || !audio.duration) return;
        audio.currentTime = (e.target.value / 100) * audio.duration;
        document.getElementById('scrubber-fill').style.width = `${e.target.value}%`;
    });

    $('player-download').addEventListener('click', () => {
        if (currentEpisode) {
            window.open(api.chunkAudioUrl(currentEpisode.id, currentChunkIndex), '_blank');
        }
    });
    
    // Queue toggle
    const queueBtn = document.getElementById('btn-queue-toggle');
    if (queueBtn) {
        queueBtn.addEventListener('click', showQueue);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't capture when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlay();
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
            case 'q':
            case 'Q':
                showQueue();
                break;
        }
    });

    // Save before unload
    window.addEventListener('beforeunload', () => savePosition());

    // Periodic save
    startPeriodicSave();
}
