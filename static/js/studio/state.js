/**
 * Simple pub/sub reactive store with immutability enforcement.
 */

const _state = {
    currentView: 'import',   // 'import' | 'source' | 'episode'
    currentSourceId: null,
    currentEpisodeId: null,
    libraryTree: null,
    voices: [],
    tags: [],
    settings: {},
    playingEpisodeId: null,
    playingChunkIndex: null,
};

const _listeners = {};

function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Object.isFrozen(obj)) return obj;
    Object.freeze(obj);
    for (const val of Object.values(obj)) {
        if (val !== null && typeof val === 'object') {
            deepFreeze(val);
        }
    }
    return obj;
}

export function get(key) {
    return _state[key];
}

export function set(key, value) {
    _state[key] = deepFreeze(value);
    if (_listeners[key]) {
        for (const fn of _listeners[key]) {
            try { fn(value); } catch (e) { console.error('State listener error:', e); }
        }
    }
}

export function on(key, fn) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(fn);
    return () => {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
    };
}

export function emit(key, value) {
    if (_listeners[key]) {
        for (const fn of _listeners[key]) {
            try { fn(value); } catch (e) { console.error('State listener error:', e); }
        }
    }
}

export function getAll() {
    return { ..._state };
}
