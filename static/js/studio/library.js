/**
 * Library tree panel — folders, sources, episodes.
 * Premium Edition with enhanced visuals
 */

import * as api from './api.js';
import * as state from './state.js';
import { toast, confirm as confirmDialog } from './main.js';

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

export async function refreshTree() {
    try {
        const tree = await api.libraryTree();
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
            await api.updateFolder(folder.id, { name: newName });
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
            await api.updateSource(source.id, { title: newName });
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
            await api.updateEpisode(episode.id, { title: newName });
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
    await api.createFolder('New Folder', parentId);
    refreshTree();
    toast('Folder created', 'success');
}

async function doDeleteFolder(id) {
    const ok = await confirmDialog('Delete Folder', 'Delete this folder? Items inside will be moved to the root.');
    if (ok) {
        await api.deleteFolder(id);
        refreshTree();
        toast('Folder deleted', 'info');
    }
}

async function doDeleteSource(id) {
    const ok = await confirmDialog('Delete Source', 'Delete this source and all its episodes?');
    if (ok) {
        await api.deleteSource(id);
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
        await api.deleteEpisode(id);
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
            api.moveSource(data.id, folderId).then(() => {
                refreshTree();
                toast('Source moved', 'success');
            });
        } else if (data.type === 'episode') {
            api.moveEpisode(data.id, folderId).then(() => {
                refreshTree();
                toast('Episode moved', 'success');
            });
        }
    } catch {}
}

// ── Init ────────────────────────────────────────────────────────────

export function init() {
    document.getElementById('btn-new-folder').addEventListener('click', async () => {
        await api.createFolder('New Folder');
        refreshTree();
        toast('Folder created', 'success');
    });

    const nowPlayingBtn = document.getElementById('btn-now-playing');
    if (nowPlayingBtn) {
        nowPlayingBtn.addEventListener('click', () => {
            window.location.hash = '#now-playing';
        });
    }

    state.on('libraryTree', render);
    refreshTree();
}
