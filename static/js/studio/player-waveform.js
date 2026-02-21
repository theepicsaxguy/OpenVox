/**
 * Waveform visualization - canvas drawing for waveform
 */

import * as playerState from './player-state.js';

let waveformBars = [];
let waveformAnimationId = null;

export {
    waveformBars,
    waveformAnimationId,
};

export function setWaveformAnimationId(id) {
    waveformAnimationId = id;
}

export function initWaveformBars() {
    waveformBars = [];
    for (let i = 0; i < 30; i++) {
        waveformBars.push({
            baseHeight: 10 + Math.random() * 20,
            phase: Math.random() * Math.PI * 2
        });
    }
}

export function drawWaveform() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const audio = playerState.getAudio();
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
            barHeight = bar.baseHeight + Math.sin(time * 4 + bar.phase) * 8;
            barHeight = Math.max(4, Math.min(barHeight, height * 0.6));
        }

        ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
}

export function startWaveformAnimation() {
    if (waveformAnimationId) cancelAnimationFrame(waveformAnimationId);

    let lastDraw = 0;
    function animate(timestamp) {
        if (timestamp - lastDraw >= 33) {
            drawWaveform();
            lastDraw = timestamp;
        }
        waveformAnimationId = requestAnimationFrame(animate);
    }
    animate(0);
}

export function stopWaveformAnimation() {
    if (waveformAnimationId) {
        cancelAnimationFrame(waveformAnimationId);
        waveformAnimationId = null;
    }
}

export function handleResize() {
    initWaveformBars();
    drawWaveform();
}
