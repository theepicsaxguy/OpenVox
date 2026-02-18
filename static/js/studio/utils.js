/**
 * Shared utility functions for the Studio frontend.
 */

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text - The text to escape.
 * @returns {string} Escaped HTML string.
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format seconds into mm:ss display format.
 * @param {number} secs - Seconds to format.
 * @returns {string} Formatted time string (e.g., "3:45").
 */
export function formatTime(secs) {
    if (!secs || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Shorthand for document.getElementById.
 * @param {string} id - Element ID.
 * @returns {HTMLElement|null} The element or null.
 */
export function $(id) {
    return document.getElementById(id);
}

/**
 * Debounce a function to limit execution rate.
 * @param {Function} fn - Function to debounce.
 * @param {number} delay - Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
export function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle a function to limit execution rate.
 * @param {Function} fn - Function to throttle.
 * @param {number} limit - Time limit in milliseconds.
 * @returns {Function} Throttled function.
 */
export function throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
