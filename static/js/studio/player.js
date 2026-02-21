/**
 * Audio player — chunk-based playback with auto-advance and waveform visualization.
 * Premium Edition
 *
 * This is a thin coordinator that imports from specialized modules:
 * - player-state.js: Core state management
 * - player-controls.js: UI controls and event handlers
 * - player-queue.js: Queue management
 * - player-waveform.js: Waveform visualization
 * - player-render.js: Rendering functions
 * - player-chunk.js: Chunk loading and playback
 */

import { toast } from './main.js';
import * as state from './state.js';
import { triggerHaptic } from './utils.js';
import * as playerState from './player-state.js';
import * as playerRender from './player-render.js';
import * as playerQueue from './player-queue.js';
import * as playerControls from './player-controls.js';
import * as playerWaveform from './player-waveform.js';
import * as playerChunk from './player-chunk.js';

const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let swipeGesturesInitialized = false;

function initSwipeGestures() {
    if (swipeGesturesInitialized) return;
    swipeGesturesInitialized = true;
    const playerContainer = document.getElementById('player-bar');
    const fullscreenPlayer = document.getElementById('fullscreen-player');

    function handleSwipe(startX, endX, startY, endY) {
        const diffX = endX - startX;
        const diffY = endY - startY;
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        if (absX < absY) return;

        const minSwipe = 50;
        const maxTime = 500;

        if (absX > minSwipe && touchStartTime < maxTime) {
            if (diffX > 0) {
                triggerHaptic('light');
                playerControls.prevChunk();
            } else {
                triggerHaptic('light');
                playerControls.nextChunk();
            }
        }
    }

    if (playerContainer) {
        playerContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });

        playerContainer.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            handleSwipe(touchStartX, endX, touchStartY, endY);
        }, { passive: true });
    }

    if (fullscreenPlayer) {
        fullscreenPlayer.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });

        fullscreenPlayer.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            handleSwipe(touchStartX, endX, touchStartY, endY);
        }, { passive: true });
    }
}

function shareEpisode() {
    const episode = playerState.getCurrentEpisode();
    if (!episode) return;

    const shareData = {
        title: episode.title,
        text: `Listen to "${episode.title}"`,
        url: window.location.href,
    };

    if (navigator.share) {
        navigator.share(shareData)
            .then(() => triggerHaptic('success'))
            .catch((e) => {
                if (e.name !== 'AbortError') console.warn('Share failed:', e.message);
            });
    } else {
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                toast('Link copied to clipboard', 'info');
                triggerHaptic('success');
            })
            .catch(() => {
                toast('Failed to copy link', 'error');
            });
    }
}

function _clearHistory() {
    localStorage.removeItem('pocket_tts_playback_history');
    state.emit('history-updated', []);
    toast('Playback history cleared', 'info');
}

export async function loadEpisode(episodeId, startChunk = null) {
    return playerChunk.loadEpisode(episodeId, startChunk);
}

let playerInitialized = false;

export function init() {
    if (playerInitialized) return;
    playerInitialized = true;

    playerWaveform.initWaveformBars();
    playerRender.initFullscreenPlayer();
    playerControls.initControls();
    playerQueue.initQueue();
    initSwipeGestures();

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            playerWaveform.initWaveformBars();
            playerWaveform.drawWaveform();
        }, 100);
    });

    setTimeout(playerWaveform.drawWaveform, 100);

    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            shareEpisode();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        switch (e.key) {
        case 'q':
        case 'Q':
            playerQueue.showQueue();
            break;
        case 'f':
        case 'F': {
            const isFullscreen = playerState.getIsFullscreen ? playerState.getIsFullscreen() : false;
            if (!isFullscreen) {
                playerRender.openFullscreenPlayer();
            } else {
                playerRender.closeFullscreenPlayer();
            }
            break;
        }
        case 's':
        case 'S':
            if (e.shiftKey) {
                playerRender.showSleepTimerMenu();
            } else {
                playerControls.savePosition();
                toast('Position saved', 'info');
            }
            break;
        }
    });
}

export function setPlaybackSpeed(speed) {
    playerControls.setPlaybackSpeed(speed);
}

export function getPlaybackHistory() {
    return playerChunk.getPlaybackHistory();
}

export { playerControls, playerWaveform, playerRender, playerQueue, playerState };
