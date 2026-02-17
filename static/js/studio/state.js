/**
 * Simple pub/sub reactive store.
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

export function get(key) {
    return _state[key];
}

export function set(key, value) {
    _state[key] = value;
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

export function getAll() {
    return { ..._state };
}
