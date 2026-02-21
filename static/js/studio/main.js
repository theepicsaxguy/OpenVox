/**
 * Studio entry point — hash router, init, utilities.
 * Premium Edition with enhanced interactions
 */

import { init as initLibrary } from './library.js';
import { init as initEditor, route as editorRoute } from './editor.js';
import { init as initPlayer } from './player.js';
import { init as initSettings } from './settings.js';

// ── Toast notifications ─────────────────────────────────────────────

export function toast(message, type = 'info', duration = 4000) {
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
    }, duration);
}

// ── Undo Toast ─────────────────────────────────────────────────────

let undoTimeout = null;
let undoCallback = null;

export function showUndoToast(message, onUndo, duration = 2000) {
    clearTimeout(undoTimeout);
    undoCallback = onUndo;

    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast undo-toast';
    el.innerHTML = `
        <span class="undo-message">${message}</span>
        <button class="undo-btn" id="undo-btn">Undo</button>
    `;
    container.appendChild(el);

    requestAnimationFrame(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        requestAnimationFrame(() => {
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
        });
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        clearTimeout(undoTimeout);
        if (undoCallback) undoCallback();
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        setTimeout(() => el.remove(), 300);
        undoCallback = null;
    });

    undoTimeout = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        setTimeout(() => el.remove(), 300);
        undoCallback = null;
    }, duration);
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
        setTimeout(() => {
            document.getElementById('confirm-cancel').focus();
            trapFocus(modal);
        }, 50);
    });
}

function initConfirmDialog() {
    const modal = document.getElementById('confirm-modal');

    document.getElementById('confirm-ok').addEventListener('click', () => {
        modal.classList.add('hidden');
        modal._closeTrap?.();
        if (confirmResolve) confirmResolve(true);
        confirmResolve = null;
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        modal.classList.add('hidden');
        modal._closeTrap?.();
        if (confirmResolve) confirmResolve(false);
        confirmResolve = null;
    });

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modal.classList.add('hidden');
            modal._closeTrap?.();
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
        trapFocus(modal);
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
            if (!modal.classList.contains('hidden')) trapFocus(modal);
        }
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });
}

// ── Focus trapping for modals ────────────────────────────────────────

function trapFocus(modal) {
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;

    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    firstFocusable.focus();

    function handleTab(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            }
        } else {
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    }

    modal._trapHandler = handleTab;
    modal.addEventListener('keydown', handleTab);

    modal._closeTrap = () => {
        modal.removeEventListener('keydown', modal._trapHandler);
    };
}

// ── Mobile Navigation & Bottom Sheet ────────────────────────────────

function initMobileNavigation() {
    const mobileNav = document.getElementById('mobile-nav');
    if (!mobileNav) return;

    const navItems = mobileNav.querySelectorAll('.mobile-nav-item');

    function updateActiveRoute() {
        const hash = window.location.hash || '#import';
        let route = 'import';

        if (hash.startsWith('#episode') || hash.startsWith('#source') || hash.startsWith('#review')) {
            route = 'library';
        } else if (hash === '#now-playing' || hash === '#queue') {
            route = 'library';
        } else if (hash === '#settings') {
            route = 'settings';
        } else if (hash === '#library') {
            route = 'library';
        } else if (hash === '#search') {
            route = 'search';
        } else if (hash === '#import' || hash === '' || hash === '#') {
            route = 'import';
        }

        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.route === route);
        });
    }

    window.addEventListener('hashchange', updateActiveRoute);
    updateActiveRoute();
}

function initBottomSheet() {
    const overlay = document.getElementById('bottom-sheet-overlay');
    const sheet = document.getElementById('bottom-sheet');
    if (!overlay || !sheet) return;

    function openBottomSheet(title, actions) {
        const content = document.getElementById('bottom-sheet-content');
        const titleEl = document.getElementById('bottom-sheet-title');

        titleEl.textContent = title;
        content.innerHTML = '';

        actions.forEach(action => {
            if (action.sep) {
                const divider = document.createElement('div');
                divider.className = 'bottom-sheet-divider';
                content.appendChild(divider);
                return;
            }

            const btn = document.createElement('button');
            btn.className = 'bottom-sheet-action';
            if (action.danger) btn.classList.add('danger');

            if (action.icon) {
                btn.innerHTML = `${action.icon}<span>${action.label}</span>`;
            } else {
                btn.textContent = action.label;
            }

            btn.addEventListener('click', () => {
                closeBottomSheet();
                action.action();
            });

            content.appendChild(btn);
        });

        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }

    function closeBottomSheet() {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    sheet.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Swipe to dismiss
    let startY = 0;
    let currentY = 0;

    sheet.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    });

    sheet.addEventListener('touchmove', (e) => {
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            sheet.style.transform = `translateY(${diff}px)`;
        }
    });

    sheet.addEventListener('touchend', () => {
        const diff = currentY - startY;
        if (diff > 100) {
            closeBottomSheet();
        }
        sheet.style.transform = '';
    });

    // Make available globally
    window.openBottomSheet = openBottomSheet;
    window.closeBottomSheet = closeBottomSheet;
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
        ripple.className = 'ripple';

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
}

// ── Sidebar & Drawer Toggle (Tablet/Mobile) ────────────────────────

function initSidebarToggle() {
    const hamburgerBtn = document.getElementById('btn-hamburger');
    const sidebar = document.getElementById('sidebar');
    const drawer = document.getElementById('drawer');

    if (!hamburgerBtn) return;

    // Create overlay if needed
    let sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (!sidebarOverlay) {
        sidebarOverlay = document.createElement('div');
        sidebarOverlay.className = 'sidebar-overlay';
        document.body.appendChild(sidebarOverlay);
    }

    function closeAll() {
        sidebar?.classList.remove('open');
        drawer?.classList.remove('open');
        sidebarOverlay?.classList.remove('visible');
    }

    function toggleSidebar() {
        if (sidebar?.classList.contains('open')) {
            closeAll();
        } else {
            closeAll();
            sidebar?.classList.add('open');
            sidebarOverlay?.classList.add('visible');
        }
    }

    function toggleDrawer() {
        if (drawer?.classList.contains('open')) {
            closeAll();
        } else {
            closeAll();
            drawer?.classList.add('open');
            sidebarOverlay?.classList.add('visible');
        }
    }

    hamburgerBtn.addEventListener('click', toggleSidebar);

    // Close on overlay click
    sidebarOverlay?.addEventListener('click', closeAll);

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll();
    });

    // Listen for custom events from router
    window.addEventListener('open-sidebar', () => {
        if (window.innerWidth <= 1024) {
            toggleSidebar();
        }
    });

    window.addEventListener('open-settings', () => {
        if (window.innerWidth <= 1024) {
            toggleDrawer();
        }
    });
}

// ── Bootstrap ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    initConfirmDialog();
    initKeyboardModal();
    initNewContentButton();
    initRippleEffect();
    initMobileNavigation();
    initBottomSheet();
    initSidebarToggle();

    initEditor();
    initPlayer();
    initLibrary();
    await initSettings();

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
});
