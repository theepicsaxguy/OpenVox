/**
 * Library tree panel — folders, sources, episodes.
 * Premium Edition with enhanced visuals
 */

import { client as api } from './api.js';
import * as state from './state.js';
import { toast, confirm as confirmDialog } from './main.js';
import { loadEpisode } from './player.js';

const SVG_FOLDER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
</svg>`;

const SVG_SOURCE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
</svg>`;

const SVG_EPISODE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="10"/>
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
</svg>`;

let activeContextMenu = null;
const selectedItems = new Set();
// eslint-disable-next-line no-unused-vars
let isBulkMode = false;

// ── Touch Gestures & Swipe Actions ────────────────────────────────

function initTouchGestures() {
    const tree = document.getElementById('library-tree');
    if (!tree) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchedElement = null;

    tree.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.tree-item');
        if (!item) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchedElement = item;
    }, { passive: true });

    tree.addEventListener('touchend', (e) => {
        if (!touchedElement) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Horizontal swipe
        if (Math.abs(diffX) > 80 && Math.abs(diffX) > Math.abs(diffY) * 2) {
            const type = touchedElement.dataset.type;
            const id = touchedElement.dataset.id;

            if (diffX > 0) {
                // Swipe right - show actions
                showSwipeActions(touchedElement, type, id);
            } else {
                // Swipe left - quick delete or select
                handleSwipeLeft(touchedElement, type, id);
            }
        }

        touchedElement = null;
    }, { passive: true });

    // Long press for context menu on mobile
    let longPressTimer = null;

    tree.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.tree-item');
        if (!item) return;

        longPressTimer = setTimeout(() => {
            const type = item.dataset.type;
            const id = item.dataset.id;

            if (type === 'episode') {
                showContextMenuForItem(item, type, id);
            } else if (type === 'source') {
                showContextMenuForItem(item, type, id);
            }
        }, 500);
    }, { passive: true });

    tree.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });

    tree.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    }, { passive: true });
}

function showSwipeActions(item, type, id) {
    if (type === 'episode') {
        window.openBottomSheet('Episode Actions', [
            {
                label: 'Play',
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
                action: () => { window.location.hash = `#episode/${id}`; }
            },
            { sep: true },
            {
                label: 'Move to Folder',
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
                action: () => { /* TODO: Feature - Folder Picker Modal for moving episode to different folder
                 * Context: This is triggered from the "Move to Folder" option in the swipe actions menu.
                 * Requirement: Create a new UI component - a modal that displays the folder tree and allows
                 * selecting a destination folder. Should include: folder tree visualization, search/filter,
                 * create new folder option, and confirm/cancel actions.
                 * Date: 2026-02-19
                 * Related: Similar TODO at line 693 for bulk move operation */ }
            },
            {
                label: 'Rename',
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                action: () => startRenameFromId(type, id)
            },
        ]);
    } else if (type === 'source') {
        window.openBottomSheet('Source Actions', [
            {
                label: 'Open',
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
                action: () => { window.location.hash = `#source/${id}`; }
            },
            { sep: true },
            {
                label: 'Rename',
                icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                action: () => startRenameFromId(type, id)
            },
        ]);
    }
}

function handleSwipeLeft(item, type, id) {
    if (type === 'episode') {
        doDeleteEpisode(id);
    } else if (type === 'source') {
        doDeleteSource(id);
    } else if (type === 'folder') {
        doDeleteFolder(id);
    }
}

async function startRenameFromId(type, id) {
    // This is a simplified version - in production you'd fetch the item first
    // For now, just navigate to the item
    if (type === 'episode') {
        window.location.hash = `#episode/${id}`;
    } else if (type === 'source') {
        window.location.hash = `#source/${id}`;
    }
}

function showContextMenuForItem(item, type, id) {
    if (type === 'episode') {
        showContextMenu({ clientX: item.getBoundingClientRect().left + 50, clientY: item.getBoundingClientRect().top }, [
            { label: 'Play', action: () => { window.location.hash = `#episode/${id}`; } },
            { label: 'Rename', action: () => startRenameFromId(type, id) },
            { sep: true },
            { label: 'Delete', danger: true, action: () => doDeleteEpisode(id) },
        ]);
    } else if (type === 'source') {
        showContextMenu({ clientX: item.getBoundingClientRect().left + 50, clientY: item.getBoundingClientRect().top }, [
            { label: 'Open', action: () => { window.location.hash = `#source/${id}`; } },
            { label: 'Rename', action: () => startRenameFromId(type, id) },
            { sep: true },
            { label: 'Delete', danger: true, action: () => doDeleteSource(id) },
        ]);
    }
}

// ── Bulk Selection Mode ───────────────────────────────────────────

function initBulkSelection() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            exitBulkMode();
        }
    });

    // Click on empty space to exit
    document.getElementById('library-tree')?.addEventListener('click', (e) => {
        if (e.target.id === 'library-tree' || e.target.classList.contains('tree-wrapper')) {
            exitBulkMode();
        }
    });
}

function enterBulkMode() {
    isBulkMode = true;
    selectedItems.clear();

    document.body.classList.add('bulk-selection-mode');

    // Show bulk actions bar if exists
    const bulkBar = document.getElementById('bulk-actions-bar');
    if (bulkBar) {
        bulkBar.classList.remove('hidden');
    }
}

function exitBulkMode() {
    isBulkMode = false;
    selectedItems.clear();

    document.body.classList.remove('bulk-selection-mode');

    // Hide bulk actions bar
    const bulkBar = document.getElementById('bulk-actions-bar');
    if (bulkBar) {
        bulkBar.classList.add('hidden');
    }

    // Remove selection styling
    document.querySelectorAll('.tree-item.selected').forEach(el => {
        el.classList.remove('selected');
    });
}

function _toggleItemSelection(type, id) {
    const key = `${type}:${id}`;

    if (selectedItems.has(key)) {
        selectedItems.delete(key);
    } else {
        selectedItems.add(key);
    }

    const item = document.querySelector(`.tree-item[data-type="${type}"][data-id="${id}"]`);
    if (item) {
        item.classList.toggle('selected', selectedItems.has(key));
    }

    // Show bulk bar when items selected
    if (selectedItems.size > 0) {
        enterBulkMode();
    }
}

export async function refreshTree() {
    try {
        const tree = await api.getApiStudioLibraryTree();
        state.set('libraryTree', tree);
        render(tree);
    } catch (e) {
        console.error('Failed to load library:', e);
    }
}

function render(tree) {
    const container = document.getElementById('library-tree');
    container.innerHTML = '';

    const { folders, sources, episodes } = tree;
    const folderMap = {};
    for (const f of folders) folderMap[f.id] = { ...f, children: [], sources: [], episodes: [] };

    // Assign sources and episodes to folders
    const rootSources = [];
    const rootEpisodes = [];

    for (const s of sources) {
        if (s.folder_id && folderMap[s.folder_id]) {
            folderMap[s.folder_id].sources.push(s);
        } else {
            rootSources.push(s);
        }
    }
    for (const e of episodes) {
        if (e.folder_id && folderMap[e.folder_id]) {
            folderMap[e.folder_id].episodes.push(e);
        } else {
            rootEpisodes.push(e);
        }
    }

    // Build folder tree
    const rootFolders = [];
    for (const f of folders) {
        if (f.parent_id && folderMap[f.parent_id]) {
            folderMap[f.parent_id].children.push(folderMap[f.id]);
        } else {
            rootFolders.push(folderMap[f.id]);
        }
    }

    // Render recently played
    renderRecentlyPlayed(episodes);

    // Render root folders
    for (const folder of rootFolders) {
        container.appendChild(renderFolder(folder));
    }

    // Render root items
    for (const s of rootSources) container.appendChild(renderSourceItem(s));
    for (const e of rootEpisodes) container.appendChild(renderEpisodeItem(e));

    if (!folders.length && !sources.length && !episodes.length) {
        const empty = document.createElement('div');
        empty.className = 'tree-item';
        empty.style.cssText = 'color: var(--text-muted); padding: 20px;';
        empty.innerHTML = `
            <span style="text-align: center; width: 100%; font-size: 0.85rem;">
                Library is empty.<br>Import content to get started.
            </span>
        `;
        container.appendChild(empty);
    }
}

function renderRecentlyPlayed(episodes) {
    const section = document.getElementById('recently-played');
    const list = document.getElementById('recently-played-list');
    list.innerHTML = '';

    const recent = episodes
        .filter(e => e.last_played_at && e.status === 'ready')
        .sort((a, b) => (b.last_played_at || '').localeCompare(a.last_played_at || ''))
        .slice(0, 3);

    if (!recent.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    for (const ep of recent) {
        list.appendChild(renderEpisodeItem(ep));
    }
}

function renderFolder(folder) {
    const wrap = document.createElement('div');
    wrap.className = 'folder-wrap';
    const item = createTreeItem(SVG_FOLDER, folder.name, 'folder', folder.id);

    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, [
            { label: 'Play All', action: () => playFolderPlaylist(folder.id) },
            { sep: true },
            { label: 'Rename', action: () => startRenameFolder(item, folder) },
            { label: 'New Subfolder', action: () => createSubfolder(folder.id) },
            { sep: true },
            { label: 'Delete Folder', danger: true, action: () => doDeleteFolder(folder.id) },
        ]);
    });

    // Drag target
    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drop-target');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drop-target');
        handleDrop(e, folder.id);
    });

    item.addEventListener('dblclick', () => startRenameFolder(item, folder));

    wrap.appendChild(item);

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-folder-children';

    for (const child of (folder.children || [])) {
        childContainer.appendChild(renderFolder(child));
    }
    for (const s of (folder.sources || [])) {
        childContainer.appendChild(renderSourceItem(s));
    }
    for (const ep of (folder.episodes || [])) {
        childContainer.appendChild(renderEpisodeItem(ep));
    }

    wrap.appendChild(childContainer);
    return wrap;
}

function renderSourceItem(source) {
    const item = createTreeItem(SVG_SOURCE, source.title, 'source', source.id);
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'source', id: source.id }));
        item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => {
        item.style.opacity = '1';
    });

    item.addEventListener('click', () => {
        window.location.hash = `#source/${source.id}`;
    });

    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, [
            { label: 'Open', action: () => { window.location.hash = `#source/${source.id}`; } },
            { label: 'Rename', action: () => startRenameSource(item, source) },
            { sep: true },
            { label: 'Delete', danger: true, action: () => doDeleteSource(source.id) },
        ]);
    });

    if (state.get('currentView') === 'source' && state.get('currentSourceId') === source.id) {
        item.classList.add('active');
    }

    return item;
}

function renderEpisodeItem(episode) {
    const item = createTreeItem(SVG_EPISODE, episode.title, 'episode', episode.id);
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'episode', id: episode.id }));
        item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => {
        item.style.opacity = '1';
    });

    item.addEventListener('click', () => {
        window.location.hash = `#episode/${episode.id}`;
    });

    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, [
            { label: 'Open', action: () => { window.location.hash = `#episode/${episode.id}`; } },
            { label: 'Rename', action: () => startRenameEpisode(item, episode) },
            { sep: true },
            { label: 'Delete', danger: true, action: () => doDeleteEpisode(episode.id) },
        ]);
    });

    // Status badge
    if (episode.status && episode.status !== 'ready') {
        const badge = document.createElement('span');
        badge.className = `tree-item-badge status-${episode.status}`;
        badge.textContent = episode.status;
        item.appendChild(badge);
    }

    // Progress bar
    if (episode.percent_listened && episode.percent_listened > 0) {
        const bar = document.createElement('div');
        bar.className = 'tree-item-progress';
        const fill = document.createElement('div');
        fill.className = 'tree-item-progress-fill';
        fill.style.width = `${Math.min(100, episode.percent_listened)}%`;
        bar.appendChild(fill);
        item.appendChild(bar);
    }

    if (state.get('currentView') === 'episode' && state.get('currentEpisodeId') === episode.id) {
        item.classList.add('active');
    }

    return item;
}

function createTreeItem(iconSvg, label, type, id) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.type = type;
    item.dataset.id = id;

    const icon = document.createElement('span');
    icon.className = 'tree-item-icon';
    icon.innerHTML = iconSvg;

    const labelEl = document.createElement('span');
    labelEl.className = 'tree-item-label';
    labelEl.textContent = label;

    item.appendChild(icon);
    item.appendChild(labelEl);
    return item;
}

// ── Context menu ────────────────────────────────────────────────────

function showContextMenu(e, items) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Position menu
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 150);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    for (const item of items) {
        if (item.sep) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-sep';
            menu.appendChild(sep);
            continue;
        }
        const btn = document.createElement('button');
        btn.className = 'context-menu-item';
        if (item.danger) btn.classList.add('danger');
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
            closeContextMenu();
            item.action();
        });
        menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    activeContextMenu = menu;

    const close = () => { closeContextMenu(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
}

function closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

// ── Rename Functions ────────────────────────────────────────────────

function startRenameFolder(item, folder) {
    const label = item.querySelector('.tree-item-label');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = folder.name;
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
        const newName = input.value.trim();
        if (newName && newName !== folder.name) {
            await api.putApiStudioFoldersFolderId(folder.id, { name: newName });
            toast('Folder renamed', 'success');
        }
        refreshTree();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = folder.name; input.blur(); }
    });
}

function startRenameSource(item, source) {
    const label = item.querySelector('.tree-item-label');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = source.title;
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
        const newName = input.value.trim();
        if (newName && newName !== source.title) {
            await api.putApiStudioSourcesSourceId(source.id, { title: newName });
            toast('Source renamed', 'success');
        }
        refreshTree();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = source.title; input.blur(); }
    });
}

function startRenameEpisode(item, episode) {
    const label = item.querySelector('.tree-item-label');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = episode.title;
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
        const newName = input.value.trim();
        if (newName && newName !== episode.title) {
            await api.putApiStudioEpisodesEpisodeId(episode.id, { title: newName });
            toast('Episode renamed', 'success');
        }
        refreshTree();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = episode.title; input.blur(); }
    });
}

// ── Actions ─────────────────────────────────────────────────────────

async function createSubfolder(parentId) {
    await api.postApiStudioFolders({ name: 'New Folder', parent_id: parentId });
    refreshTree();
    toast('Folder created', 'success');
}

async function doDeleteFolder(id) {
    const ok = await confirmDialog('Delete Folder', 'Delete this folder? Items inside will be moved to the root.');
    if (ok) {
        await api.deleteApiStudioFoldersFolderId(id);
        refreshTree();
        toast('Folder deleted', 'info');
    }
}

async function doDeleteSource(id) {
    const ok = await confirmDialog('Delete Source', 'Delete this source and all its episodes?');
    if (ok) {
        await api.deleteApiStudioSourcesSourceId(id);
        if (state.get('currentSourceId') === id) {
            window.location.hash = '#import';
        }
        refreshTree();
        toast('Source deleted', 'info');
    }
}

async function doDeleteEpisode(id) {
    const ok = await confirmDialog('Delete Episode', 'Delete this episode and its audio?');
    if (ok) {
        await api.deleteApiStudioEpisodesEpisodeId(id);
        if (state.get('currentEpisodeId') === id) {
            window.location.hash = '#import';
        }
        refreshTree();
        toast('Episode deleted', 'info');
    }
}

function handleDrop(e, folderId) {
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'source') {
            api.putApiStudioSourcesSourceIdMove(data.id, { folder_id: folderId }).then(() => {
                refreshTree();
                toast('Source moved', 'success');
            });
        } else if (data.type === 'episode') {
            api.putApiStudioEpisodesEpisodeIdMove(data.id, { folder_id: folderId }).then(() => {
                refreshTree();
                toast('Episode moved', 'success');
            });
        }
    } catch {}
}

// ── Bulk Operations ────────────────────────────────────────────────────

async function doBulkMove() {
    const episodeIds = getSelectedEpisodeIds();
    if (!episodeIds.length) return;

    // Show folder picker (simplified - just create a root folder for now)
    // In production, you'd show a modal with folder tree
    const folders = state.get('libraryTree')?.folders || [];

    if (folders.length === 0) {
        toast('No folders available. Create a folder first.', 'info');
        return;
    }

    // For now, just move to first folder
    // TODO: Feature - Folder Picker Modal for bulk move operation
    // Context: This is part of the bulk selection feature (doBulkMove function). When users select
    // multiple episodes and click "Move", they should see a folder picker modal instead of the
    // current workaround that moves items to the first available folder.
    // Requirement: Implement a modal component that displays the folder hierarchy with:
    //   - Visual folder tree with expand/collapse
    //   - Current folder highlighted
    //   - "New Folder" button for creating destination on-the-fly
    //   - Search/filter to quickly find folders
    //   - Multi-select prevention (only one destination allowed)
    // Dependencies: This requires the same folder picker component needed at line 118.
    // Implementation: Consider creating a reusable FolderPickerModal class that can be
    // instantiated for both single-item moves and bulk operations.
    // Date: 2026-02-19
    try {
        await api.postApiStudioEpisodesBulkMove({ episode_ids: episodeIds, folder_id: folders[0].id });
        toast(`Moved ${episodeIds.length} episode(s)`, 'success');
        exitBulkMode();
        refreshTree();
    } catch (e) {
        toast(`Failed to move: ${e.message}`, 'error');
    }
}

async function doBulkDelete() {
    const episodeIds = getSelectedEpisodeIds();
    if (!episodeIds.length) return;

    const ok = await confirmDialog('Delete Episodes', `Delete ${episodeIds.length} episode(s)?`);
    if (!ok) return;

    try {
        await api.postApiStudioEpisodesBulkDelete({ episode_ids: episodeIds });
        toast(`Deleted ${episodeIds.length} episode(s)`, 'info');
        exitBulkMode();
        refreshTree();
    } catch (e) {
        toast(`Failed to delete: ${e.message}`, 'error');
    }
}

function getSelectedEpisodeIds() {
    const ids = [];
    for (const item of selectedItems) {
        if (item.startsWith('episode:')) {
            ids.push(item.split(':')[1]);
        }
    }
    return ids;
}

// ── Folder Playlist ─────────────────────────────────────────────────

async function playFolderPlaylist(folderId) {
    try {
        const result = await api.postApiStudioFoldersFolderIdPlaylist(folderId);

        if (result.episodes && result.episodes.length > 0) {
            // Load first episode
            await loadEpisode(result.episodes[0].id, 0);
            toast(`Playing folder playlist (${result.episodes.length} episodes)`, 'success');
        } else {
            toast('No episodes in folder', 'info');
        }
    } catch (e) {
        toast(`Failed to play: ${e.message}`, 'error');
    }
}

// ── Init ────────────────────────────────────────────────────────────

export function init() {
    initTouchGestures();
    initBulkSelection();

    // Bulk action buttons
    document.getElementById('bulk-move-btn')?.addEventListener('click', doBulkMove);
    document.getElementById('bulk-delete-btn')?.addEventListener('click', doBulkDelete);
    document.getElementById('bulk-close-btn')?.addEventListener('click', exitBulkMode);

    document.getElementById('btn-new-folder').addEventListener('click', async () => {
        await api.postApiStudioFolders({ name: 'New Folder' });
        refreshTree();
        toast('Folder created', 'success');
    });

    const nowPlayingBtn = document.getElementById('btn-now-playing');
    if (nowPlayingBtn) {
        nowPlayingBtn.addEventListener('click', () => {
            const { openFullscreenPlayer } = window.playerRender || {};
            if (openFullscreenPlayer) openFullscreenPlayer();
        });
    }

    state.on('libraryTree', render);
    refreshTree();
}
