/**
 * Queue management - queue data, shuffle, repeat modes
 */

import * as playerState from './player-state.js';
import { formatTime } from './utils.js';

let queue = [];
let queueIndex = -1;
let shuffleEnabled = false;
let repeatMode = 'none';

export {
    queue,
    queueIndex,
    shuffleEnabled,
    repeatMode,
};

export function initQueue() {
    const queueBtn = document.getElementById('btn-queue-toggle');
    if (queueBtn) {
        queueBtn.addEventListener('click', showQueue);
    }
}

export function addToQueue(episode) {
    queue.push(episode);
    queueIndex = queue.length - 1;
}

export function removeFromQueue(index) {
    if (index >= 0 && index < queue.length) {
        queue.splice(index, 1);
        if (queueIndex >= index) {
            queueIndex = Math.max(0, queueIndex - 1);
        }
    }
}

export function clearQueue() {
    queue = [];
    queueIndex = -1;
}

export function getQueue() {
    return queue;
}

export function getQueueIndex() {
    return queueIndex;
}

export function setQueue(newQueue) {
    queue = newQueue;
}

export function setQueueIndex(index) {
    queueIndex = index;
}

export function setShuffleEnabled(enabled) {
    shuffleEnabled = enabled;
}

export function setRepeatMode(mode) {
    repeatMode = mode;
}

export function getNextInQueue() {
    if (queue.length === 0) return null;
    if (shuffleEnabled) {
        const randomIndex = Math.floor(Math.random() * queue.length);
        return queue[randomIndex];
    }
    if (queueIndex < queue.length - 1) {
        return queue[queueIndex + 1];
    }
    if (repeatMode === 'all' && queue.length > 0) {
        return queue[0];
    }
    return null;
}

export function getPrevInQueue() {
    if (queue.length === 0) return null;
    if (queueIndex > 0) {
        return queue[queueIndex - 1];
    }
    if (repeatMode === 'all' && queue.length > 0) {
        return queue[queue.length - 1];
    }
    return null;
}

export function showQueue() {
    const { openFullscreenPlayer } = window.playerRender || {};
    if (openFullscreenPlayer) openFullscreenPlayer();
}

export function renderQueue() {
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');
    if (!queueList) return;

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();
    const currentIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
    const remaining = chunks.length - currentIdx - 1;

    if (queueCount) {
        queueCount.textContent = remaining === 0 ? 'No chunks remaining' : `${remaining} chunk${remaining !== 1 ? 's' : ''} remaining`;
    }

    queueList.innerHTML = '';

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
            const { savePosition } = window.playerControls || {};
            const { loadChunk } = window.playerChunk || {};
            if (savePosition) savePosition();
            if (loadChunk) {
                loadChunk(chunk.chunk_index);
                const audio = playerState.getAudio();
                if (audio) audio.play().catch(() => {});
            }
        });

        queueList.appendChild(item);
    });

    const currentItem = queueList.querySelector('.queue-item.current');
    if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export function showQueueSheet() {
    const sheet = document.getElementById('bottom-sheet');
    const overlay = document.getElementById('bottom-sheet-overlay');
    const title = document.getElementById('bottom-sheet-title');
    const content = document.getElementById('bottom-sheet-content');

    if (!sheet || !overlay || !title || !content) return;

    title.textContent = 'Queue';
    content.innerHTML = '';

    const chunks = playerState.getChunks();
    const currentChunkIndex = playerState.getCurrentChunkIndex();

    if (!chunks.length) {
        content.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No chunks available</p>';
    } else {
        const currentIdx = chunks.findIndex(c => c.chunk_index === currentChunkIndex);
        chunks.forEach((chunk, idx) => {
            const isCurrent = idx === currentIdx;
            const isPast = idx < currentIdx;
            const item = document.createElement('button');
            item.className = `bottom-sheet_action ${isCurrent ? 'active' : ''} ${isPast ? 'played' : ''}`;
            item.innerHTML = `
                <span class="queue-num">${idx + 1}</span>
                <span class="queue-text">${chunk.text.substring(0, 50)}${chunk.text.length > 50 ? '...' : ''}</span>
                <span class="queue-duration">${chunk.duration_secs ? formatTime(chunk.duration_secs) : ''}</span>
            `;
            item.addEventListener('click', () => {
                const { savePosition } = window.playerControls || {};
                const { loadChunk } = window.playerChunk || {};
                if (savePosition) savePosition();
                if (loadChunk) {
                    loadChunk(chunk.chunk_index);
                    const audio = playerState.getAudio();
                    if (audio) audio.play().catch(() => {});
                }
                closeBottomSheet();
            });
            content.appendChild(item);
        });
    }

    overlay.classList.remove('hidden');
    sheet.scrollTop = 0;
}

function closeBottomSheet() {
    const overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}
