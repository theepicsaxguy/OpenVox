/**
 * Studio entry point — hash router, init, utilities.
 * Premium Edition with enhanced interactions
 */

import * as state from './state.js';
import { init as initLibrary } from './library.js';
import { init as initEditor, route as editorRoute } from './editor.js';
import { init as initPlayer } from './player.js';
import { init as initSettings } from './settings.js';

// ── Toast notifications ─────────────────────────────────────────────

export function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    
    // Animate in
    requestAnimationFrame(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        requestAnimationFrame(() => {
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
        });
    });
    
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        setTimeout(() => el.remove(), 300);
    }, 4000);
}

// ── Confirm dialog ──────────────────────────────────────────────────

let confirmResolve = null;

export function confirm(title, message) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        modal.classList.remove('hidden');
        
        // Focus the cancel button by default for safety
        setTimeout(() => document.getElementById('confirm-cancel').focus(), 50);
    });
}

function initConfirmDialog() {
    document.getElementById('confirm-ok').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        if (confirmResolve) confirmResolve(true);
        confirmResolve = null;
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        if (confirmResolve) confirmResolve(false);
        confirmResolve = null;
    });
    
    // Escape key to cancel
    document.getElementById('confirm-modal').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('confirm-modal').classList.add('hidden');
            if (confirmResolve) confirmResolve(false);
            confirmResolve = null;
        }
    });
}

// ── Keyboard shortcuts modal ────────────────────────────────────────

function initKeyboardModal() {
    const modal = document.getElementById('keyboard-modal');
    
    document.getElementById('btn-keyboard-help').addEventListener('click', () => {
        modal.classList.remove('hidden');
    });
    
    document.getElementById('close-keyboard-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === '?') {
            e.preventDefault();
            modal.classList.toggle('hidden');
        }
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });
}

// ── New content button ──────────────────────────────────────────────

function initNewContentButton() {
    document.getElementById('btn-new-content').addEventListener('click', () => {
        window.location.hash = '#import';
    });
}

// ── Hash router ─────────────────────────────────────────────────────

function handleRoute() {
    const hash = window.location.hash || '#import';
    editorRoute(hash);
}

// ── Initialize ripple effect ────────────────────────────────────────

function initRippleEffect() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-primary, .play-btn');
        if (!btn) return;
        
        const ripple = document.createElement('span');
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;
        
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        btn.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    });
    
    // Add ripple animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// ── Bootstrap ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    initConfirmDialog();
    initKeyboardModal();
    initNewContentButton();
    initRippleEffect();

    initEditor();
    initPlayer();
    initLibrary();
    await initSettings();

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
});
