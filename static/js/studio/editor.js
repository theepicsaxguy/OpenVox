/**
 * Editor panel — import, source detail, episode detail views.
 * Premium Edition with enhanced UX
 */

import * as api from './api.js';
import * as state from './state.js';
import { toast, confirm as confirmDialog, showUndoToast } from './main.js';
import { refreshTree } from './library.js';
import { loadEpisode as playerLoadEpisode } from './player.js';

// ── View switching ──────────────────────────────────────────────────

function showView(name) {
    document.querySelectorAll('.stage-view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${name}`);
    if (el) {
        el.classList.add('active');
        // Trigger animation
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        requestAnimationFrame(() => {
            el.style.transition = 'all 0.4s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }
}

// ── Import view ─────────────────────────────────────────────────────

function initImportView() {
    // Method button switching
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });

    // File dropzone
    const dropzone = document.getElementById('file-dropzone');
    const fileInput = document.getElementById('import-file');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) {
                fileInput.files = files;
                toast(`File selected: ${files[0].name}`, 'info');
            }
        });
    }

    // Segmented control for code rule
    document.querySelectorAll('.segmented-control .segment').forEach(segment => {
        segment.addEventListener('click', () => {
            const parent = segment.closest('.segmented-control');
            parent.querySelectorAll('.segment').forEach(s => s.classList.remove('active'));
            segment.classList.add('active');

            const input = parent.nextElementSibling;
            if (input && input.tagName === 'INPUT') {
                input.value = segment.dataset.value;
            }
        });
    });

    // Preview clean
    document.getElementById('btn-preview-clean').addEventListener('click', async () => {
        const text = getImportText();
        const activeBtn = document.querySelector('.method-btn.active');
        const activeTab = activeBtn ? activeBtn.dataset.tab : null;

        if (!text) {
            if (activeTab === 'url') {
                return toast('Import the URL first to preview cleaned text', 'info');
            } else if (activeTab === 'file') {
                return toast('Upload a file first to preview cleaned text', 'info');
            } else {
                return toast('Enter some text first', 'error');
            }
        }

        const settings = state.get('settings') || {};
        const rule = settings.default_code_rule || 'skip';
        try {
            const result = await api.previewClean(text, rule);
            document.getElementById('preview-raw').textContent = text.substring(0, 5000);
            document.getElementById('preview-cleaned').textContent = result.cleaned_text;
            document.getElementById('raw-stats').textContent = `${text.length.toLocaleString()} chars`;
            document.getElementById('cleaned-stats').textContent = `${result.cleaned_text.length.toLocaleString()} chars`;

            const preview = document.getElementById('clean-preview');
            preview.classList.remove('hidden');
            preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    // Close preview
    document.getElementById('btn-close-preview').addEventListener('click', () => {
        document.getElementById('clean-preview').classList.add('hidden');
    });

    // Import button
    document.getElementById('btn-import').addEventListener('click', doImport);
}

function getImportText() {
    const activeBtn = document.querySelector('.method-btn.active');
    if (!activeBtn) return null;
    const activeTab = activeBtn.dataset.tab;
    if (activeTab === 'paste') return document.getElementById('import-text').value;
    if (activeTab === 'url') return null;
    if (activeTab === 'file') {
        const fileInput = document.getElementById('import-file');
        if (fileInput && fileInput.files.length > 0) {
            return fileInput.files[0].name;
        }
        return null;
    }
    return null;
}

async function doImport() {
    const activeBtn = document.querySelector('.method-btn.active');
    const activeTab = activeBtn ? activeBtn.dataset.tab : 'paste';
    const settings = state.get('settings') || {};
    const rule = settings.default_code_rule || 'skip';

    try {
        let result;
        if (activeTab === 'paste') {
            const text = document.getElementById('import-text').value.trim();
            const title = document.getElementById('import-title').value.trim();
            if (!text) return toast('Enter some text', 'error');
            result = await api.createSourceFromText(text, title || undefined, rule);
        } else if (activeTab === 'file') {
            const fileInput = document.getElementById('import-file');
            if (!fileInput.files.length) return toast('Select a file', 'error');
            result = await api.createSourceFromFile(fileInput.files[0], rule);
        } else if (activeTab === 'url') {
            const url = document.getElementById('import-url').value.trim();
            if (!url) return toast('Enter a URL', 'error');
            result = await api.createSourceFromUrl(url, rule);
        }

        toast(`Imported: ${result.title}`, 'success');
        refreshTree();
        window.location.hash = `#review/${result.id}`;

        // Clear form
        document.getElementById('import-text').value = '';
        document.getElementById('import-title').value = '';
        document.getElementById('import-url').value = '';
        document.getElementById('clean-preview').classList.add('hidden');

    } catch (e) {
        toast(e.message, 'error');
    }
}

// ── Review & Generate view ──────────────────────────────────────────

async function loadReview(sourceId) {
    clearEpisodeRefresh();
    state.set('currentSourceId', sourceId);
    state.set('currentView', 'review');
    showView('review');

    try {
        const source = await api.getSource(sourceId);

        document.getElementById('review-title').textContent = source.title;
        document.getElementById('review-breadcrumb').textContent = source.title;
        document.getElementById('review-meta').innerHTML = `
            <span class="pill">${source.source_type}</span>
            <span class="pill">${source.cleaned_text.length.toLocaleString()} chars</span>
        `;
        document.getElementById('review-cleaned-text').textContent = source.cleaned_text;

        // Populate voice selector
        await populateVoiceSelect('review-voice');

        // Apply settings defaults
        const settings = state.get('settings');
        if (settings.default_voice) {
            document.getElementById('review-voice').value = settings.default_voice;
        }
        if (settings.default_strategy) {
            document.getElementById('review-strategy').value = settings.default_strategy;
        }
        if (settings.default_max_chars) {
            document.getElementById('review-max-chars').value = settings.default_max_chars;
        }
        if (settings.default_format) {
            document.getElementById('review-format').value = settings.default_format;
        }
        if (settings.default_breathing) {
            document.getElementById('review-breathing').value = settings.default_breathing;
        }

        // Hide chunk preview
        document.getElementById('review-chunk-preview').classList.add('hidden');

    } catch (e) {
        toast(e.message, 'error');
    }

    refreshTree();
}

function initReviewView() {
    // Preview chunks
    document.getElementById('btn-review-preview-chunks').addEventListener('click', async () => {
        const id = state.get('currentSourceId');
        const source = await api.getSource(id);
        const strategy = document.getElementById('review-strategy').value;
        const maxChars = parseInt(document.getElementById('review-max-chars').value);

        try {
            const result = await api.previewChunks(source.cleaned_text, strategy, maxChars);
            renderChunkPreview(result.chunks, 'review');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    // Generate episode
    document.getElementById('btn-review-generate').addEventListener('click', async () => {
        const sourceId = state.get('currentSourceId');
        const btn = document.getElementById('btn-review-generate');
        const originalContent = btn.innerHTML;

        // Loading state
        btn.disabled = true;
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
            </svg>
            Generating...
        `;

        const data = {
            source_id: sourceId,
            voice_id: document.getElementById('review-voice').value,
            output_format: document.getElementById('review-format').value,
            chunk_strategy: document.getElementById('review-strategy').value,
            chunk_max_length: parseInt(document.getElementById('review-max-chars').value),
            breathing_intensity: document.getElementById('review-breathing').value,
        };

        try {
            const result = await api.createEpisode(data);
            toast(`Episode created (${result.chunk_count} chunks). Generating...`, 'success');
            refreshTree();
            window.location.hash = `#episode/${result.id}`;
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    });
}

function renderChunkPreview(chunks, prefix = '') {
    const container = document.getElementById(`${prefix}-chunk-list`);
    container.innerHTML = '';
    document.getElementById(`${prefix}-chunk-count`).textContent = chunks.length;
    document.getElementById(`${prefix}-chunk-preview`).classList.remove('hidden');

    for (const chunk of chunks) {
        const card = document.createElement('div');
        card.className = 'chunk-item';
        card.innerHTML = `
            <div class="chunk-header">
                <span class="chunk-label">${chunk.label}</span>
                <span class="chunk-stats">${chunk.text.length} chars</span>
            </div>
            <div class="chunk-preview-text">${escapeHtml(chunk.text.substring(0, 200))}${chunk.text.length > 200 ? '...' : ''}</div>
        `;
        container.appendChild(card);
    }

    // Scroll to preview
    document.getElementById(`${prefix}-chunk-preview`).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Source view ──────────────────────────────────────────────────────

async function loadSource(sourceId) {
    clearEpisodeRefresh();
    state.set('currentSourceId', sourceId);
    state.set('currentView', 'source');
    showView('source');

    try {
        const source = await api.getSource(sourceId);

        document.getElementById('source-title').textContent = source.title;
        document.getElementById('source-breadcrumb').textContent = source.title;
        document.getElementById('source-meta').innerHTML = `
            <span class="pill">${source.source_type}</span>
            <span class="pill">${source.cleaned_text.length.toLocaleString()} chars</span>
            <span class="pill">${new Date(source.created_at).toLocaleDateString()}</span>
        `;
        document.getElementById('source-cleaned-text').textContent = source.cleaned_text;

    } catch (e) {
        toast(e.message, 'error');
    }

    refreshTree();
}

function initSourceView() {
    // Re-clean
    document.getElementById('btn-reclean').addEventListener('click', async () => {
        const id = state.get('currentSourceId');
        const rule = document.getElementById('source-reclean-rule').value;
        try {
            const result = await api.reCleanSource(id, rule);
            document.getElementById('source-cleaned-text').textContent = result.cleaned_text;
            toast('Text re-cleaned', 'success');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    // Delete source
    document.getElementById('btn-delete-source').addEventListener('click', async () => {
        const id = state.get('currentSourceId');
        const ok = await confirmDialog('Delete Source', 'Delete this source and all its episodes?');
        if (ok) {
            await api.deleteSource(id);
            toast('Source deleted', 'info');
            refreshTree();
            window.location.hash = '#import';
        }
    });

    // Generate button - redirect to review view
    document.getElementById('btn-source-generate').addEventListener('click', async () => {
        const id = state.get('currentSourceId');
        if (id) {
            window.location.hash = `#review/${id}`;
        }
    });
}

// ── Episode view ────────────────────────────────────────────────────

let episodeRefreshInterval = null;

function clearEpisodeRefresh() {
    if (episodeRefreshInterval) {
        clearInterval(episodeRefreshInterval);
        episodeRefreshInterval = null;
    }
}

async function loadEpisode(episodeId) {
    clearEpisodeRefresh();
    state.set('currentEpisodeId', episodeId);
    state.set('currentView', 'episode');
    showView('episode');

    clearInterval(episodeRefreshInterval);

    try {
        const episode = await api.getEpisode(episodeId);
        renderEpisode(episode);

        // Auto-refresh while generating
        if (episode.status === 'pending' || episode.status === 'generating') {
            episodeRefreshInterval = setInterval(async () => {
                try {
                    const fresh = await api.getEpisode(episodeId);
                    renderEpisode(fresh);
                    if (fresh.status !== 'pending' && fresh.status !== 'generating') {
                        clearInterval(episodeRefreshInterval);
                        refreshTree();
                    }
                } catch {}
            }, 3000);
        }
    } catch (e) {
        toast(e.message, 'error');
    }

    refreshTree();
}

function renderEpisode(episode) {
    document.getElementById('episode-title').textContent = episode.title;
    document.getElementById('episode-breadcrumb').textContent = episode.title;

    const badge = document.getElementById('episode-status-badge');
    badge.textContent = episode.status;
    badge.className = `status-badge ${episode.status}`;

    const duration = episode.total_duration_secs
        ? formatTime(episode.total_duration_secs)
        : '—';

    // Show generation settings
    const settings = `Voice: ${episode.voice_id} · ${episode.output_format || 'wav'} · Breathing: ${episode.breathing_intensity || 'normal'}`;
    document.getElementById('episode-meta').textContent =
        `${settings} · ${episode.chunk_strategy || 'auto'} · ${duration} · ${new Date(episode.created_at).toLocaleDateString()}`;

    // Progress bar
    const readyChunks = episode.chunks?.filter(c => c.status === 'ready').length || 0;
    const totalChunks = episode.chunks?.length || 0;
    const pct = totalChunks > 0 ? (readyChunks / totalChunks) * 100 : 0;
    document.getElementById('episode-progress-fill').style.width = `${pct}%`;
    document.getElementById('episode-progress-text').textContent = `${Math.round(pct)}%`;

    // Generation status detail
    const genStageEl = document.getElementById('gen-stage');
    const genChunkInfoEl = document.getElementById('gen-chunk-info');

    if (episode.status === 'pending') {
        genStageEl.textContent = 'Waiting in queue...';
        genStageEl.className = 'gen-stage';
        genChunkInfoEl.textContent = `${totalChunks} chunks to generate · ${episode.voice_id}`;
    } else if (episode.status === 'generating') {
        genStageEl.textContent = 'Generating audio...';
        genStageEl.className = 'gen-stage generating';
        // Find current chunk being generated
        const generatingChunk = episode.chunks?.find(c => c.status === 'generating');
        if (generatingChunk) {
            genChunkInfoEl.textContent = `Processing chunk ${generatingChunk.chunk_index + 1}/${totalChunks} · ${readyChunks + 1} of ${totalChunks} done`;
        } else {
            genChunkInfoEl.textContent = `${readyChunks} of ${totalChunks} chunks ready`;
        }
    } else if (episode.status === 'ready') {
        genStageEl.textContent = 'Complete!';
        genStageEl.className = 'gen-stage ready';
        genChunkInfoEl.textContent = `${totalChunks} chunks · ${duration} · ${episode.voice_id}`;
    } else if (episode.status === 'error') {
        genStageEl.textContent = 'Generation failed';
        genStageEl.className = 'gen-stage error';
        genChunkInfoEl.textContent = '';
    }

    // Chunks grid
    const container = document.getElementById('episode-chunks');
    container.innerHTML = '';

    for (const chunk of (episode.chunks || [])) {
        const card = document.createElement('div');
        card.className = 'chunk-card';
        card.dataset.index = chunk.chunk_index;
        if (state.get('playingEpisodeId') === episode.id &&
            state.get('playingChunkIndex') === chunk.chunk_index) {
            card.classList.add('playing');
        }

        const isLongText = chunk.text.length > 150;

        card.innerHTML = `
            <div class="chunk-card-header">
                <span class="chunk-num">${chunk.chunk_index + 1}</span>
                <span class="chunk-status ${chunk.status}">${chunk.status}</span>
            </div>
            <div class="chunk-text" data-full-text="${escapeHtml(chunk.text)}">${escapeHtml(chunk.text.substring(0, 150))}${isLongText ? '...' : ''}</div>
            ${isLongText ? '<div class="chunk-expand-indicator">Click to expand</div>' : ''}
            <div class="chunk-footer">
                <span class="chunk-duration">${chunk.duration_secs ? formatTime(chunk.duration_secs) : '—'}</span>
                <div class="chunk-actions">
                    ${chunk.status === 'ready' ? `
                        <button class="chunk-btn play-chunk" title="Play" data-index="${chunk.chunk_index}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </button>
                    ` : ''}
                    ${(chunk.status === 'error' || chunk.status === 'ready') ? `
                        <button class="chunk-btn regen-chunk" title="Regenerate" data-index="${chunk.chunk_index}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Expand/collapse on click
        card.addEventListener('click', (e) => {
            if (e.target.closest('.chunk-btn')) return;
            card.classList.toggle('expanded');
            const expandIndicator = card.querySelector('.chunk-expand-indicator');
            if (expandIndicator) {
                expandIndicator.textContent = card.classList.contains('expanded') ? 'Click to collapse' : 'Click to expand';
            }
            const textEl = card.querySelector('.chunk-text');
            if (card.classList.contains('expanded')) {
                textEl.textContent = chunk.text;
            } else {
                textEl.textContent = escapeHtml(chunk.text.substring(0, 150)) + (chunk.text.length > 150 ? '...' : '');
            }
        });

        // Play handler
        const playBtn = card.querySelector('.play-chunk');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playerLoadEpisode(episode.id, chunk.chunk_index);
            });
        }

        // Regenerate handler
        const regenBtn = card.querySelector('.regen-chunk');
        if (regenBtn) {
            regenBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await api.regenerateChunk(episode.id, chunk.chunk_index);
                toast('Chunk queued for regeneration', 'info');
                loadEpisode(episode.id);
            });
        }

        // Card click to play
        card.addEventListener('click', () => {
            if (chunk.status === 'ready') {
                playerLoadEpisode(episode.id, chunk.chunk_index);
            }
        });

        container.appendChild(card);
    }
}

function initEpisodeView() {
    // Regenerate with settings modal
    const regenModal = document.getElementById('regen-settings-modal');
    let currentRegenEpisodeId = null;

    document.getElementById('btn-regenerate-settings').addEventListener('click', async () => {
        const id = state.get('currentEpisodeId');
        if (!id) return;

        currentRegenEpisodeId = id;

        // Populate voice select
        const voiceSelect = document.getElementById('regen-voice');
        voiceSelect.innerHTML = '<option value="">Same as before</option>';

        const voices = state.get('voices') || await api.listVoices();
        state.set('voices', voices);

        for (const v of voices) {
            const opt = document.createElement('option');
            opt.value = v.voice_id;
            opt.textContent = v.name || v.voice_id;
            voiceSelect.appendChild(opt);
        }

        regenModal.classList.remove('hidden');
    });

    document.getElementById('regen-settings-close').addEventListener('click', () => {
        regenModal.classList.add('hidden');
    });

    document.getElementById('regen-settings-cancel').addEventListener('click', () => {
        regenModal.classList.add('hidden');
    });

    document.getElementById('regen-settings-confirm').addEventListener('click', async () => {
        if (!currentRegenEpisodeId) return;

        const voiceId = document.getElementById('regen-voice').value;
        const format = document.getElementById('regen-format').value;
        const strategy = document.getElementById('regen-strategy').value;

        const settings = {};
        if (voiceId) settings.voice_id = voiceId;
        if (format) settings.format = format;
        if (strategy) settings.chunk_strategy = strategy;

        try {
            const result = await api.regenerateWithSettings(currentRegenEpisodeId, settings);

            regenModal.classList.add('hidden');

            if (result.undo_id) {
                showUndoToast(
                    'Episode queued for regeneration',
                    async () => {
                        try {
                            await api.undoRegeneration(result.undo_id);
                            toast('Regeneration undone', 'info');
                            loadEpisode(currentRegenEpisodeId);
                        } catch (e) {
                            toast(`Undo failed: ${e.message}`, 'error');
                        }
                    },
                    120000  // 2 minutes
                );
            }

            loadEpisode(currentRegenEpisodeId);
        } catch (e) {
            toast(`Failed: ${e.message}`, 'error');
        }
    });

    // Close modal on overlay click
    regenModal.addEventListener('click', (e) => {
        if (e.target === regenModal) {
            regenModal.classList.add('hidden');
        }
    });

    document.getElementById('btn-regenerate-episode').addEventListener('click', async () => {
        const id = state.get('currentEpisodeId');
        const ok = await confirmDialog('Regenerate Episode', 'Regenerate all chunks? This will delete existing audio.');
        if (ok) {
            await api.regenerateEpisode(id);
            toast('Episode queued for regeneration', 'info');
            loadEpisode(id);
        }
    });

    document.getElementById('btn-download-episode').addEventListener('click', () => {
        const id = state.get('currentEpisodeId');
        if (id) {
            window.open(api.fullEpisodeAudioUrl(id), '_blank');
        }
    });

    document.getElementById('btn-delete-episode').addEventListener('click', async () => {
        const id = state.get('currentEpisodeId');
        const ok = await confirmDialog('Delete Episode', 'Delete this episode and its audio?');
        if (ok) {
            await api.deleteEpisode(id);
            toast('Episode deleted', 'info');
            refreshTree();
            window.location.hash = '#import';
        }
    });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function populateVoiceSelect(selectId) {
    let voices = state.get('voices');
    if (!voices || !voices.length) {
        voices = await api.listVoices();
        state.set('voices', voices);
    }

    const sel = document.getElementById(selectId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '';
    for (const v of voices) {
        const opt = document.createElement('option');
        opt.value = v.id || v.voice_id;
        opt.textContent = `${v.name} (${v.type || 'builtin'})`;
        sel.appendChild(opt);
    }
    if (currentVal) sel.value = currentVal;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(secs) {
    if (!secs || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Now Playing View ────────────────────────────────────────────────

function loadNowPlaying() {
    clearEpisodeRefresh();
    state.set('currentView', 'now-playing');
    showView('now-playing');
    refreshTree();

    // Update queue if already playing
    if (state.get('playingEpisodeId')) {
        import('./player.js').then(player => {
            // Trigger queue update
            player.loadEpisode(state.get('playingEpisodeId'), state.get('playingChunkIndex'));
        });
    }
}

// ── Library View (Mobile Full Page) ─────────────────────────────────────

async function initLibraryView() {
    const container = document.getElementById('library-episodes');
    const sourcesContainer = document.getElementById('library-sources');

    if (!container || !sourcesContainer) return;

    try {
        // Load episodes
        const episodesRes = await fetch('/api/studio/episodes');
        const episodes = await episodesRes.json();

        if (episodes.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No episodes yet</p></div>';
        } else {
            container.innerHTML = episodes.map(ep => `
                <div class="library-card" data-episode-id="${ep.id}" data-chunk-index="0">
                    <div class="library-card-artwork">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                    </div>
                    <div class="library-card-info">
                        <h4>${escapeHtml(ep.title)}</h4>
                        <p>${ep.chunk_count || 0} chunks</p>
                    </div>
                    <span class="library-card-status ${ep.status}">${ep.status}</span>
                </div>
            `).join('');

            // Add click handlers
            container.querySelectorAll('.library-card').forEach(card => {
                card.addEventListener('click', () => {
                    const epId = card.dataset.episodeId;
                    window.location.hash = `#episode/${epId}`;
                });
            });
        }

        // Load sources
        const sourcesRes = await fetch('/api/studio/sources');
        const sources = await sourcesRes.json();

        if (sources.length === 0) {
            sourcesContainer.innerHTML = '<div class="empty-state"><p>No sources yet</p></div>';
        } else {
            sourcesContainer.innerHTML = sources.map(src => `
                <div class="library-card" data-source-id="${src.id}">
                    <div class="library-card-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div class="library-card-info">
                        <h4>${escapeHtml(src.title)}</h4>
                        <p>${src.source_type}</p>
                    </div>
                </div>
            `).join('');

            sourcesContainer.querySelectorAll('.library-card').forEach(card => {
                card.addEventListener('click', () => {
                    const srcId = card.dataset.sourceId;
                    window.location.hash = `#source/${srcId}`;
                });
            });
        }
    } catch (err) {
        console.error('Failed to load library:', err);
        container.innerHTML = '<div class="empty-state"><p>Failed to load library</p></div>';
    }
}

// ── Router ──────────────────────────────────────────────────────────

export function route(hash) {
    const parts = hash.replace('#', '').split('/');

    if (parts[0] === 'source' && parts[1]) {
        loadSource(parts[1]);
    } else if (parts[0] === 'review' && parts[1]) {
        loadReview(parts[1]);
    } else if (parts[0] === 'episode' && parts[1]) {
        loadEpisode(parts[1]);
    } else if (parts[0] === 'now-playing') {
        loadNowPlaying();
    } else if (parts[0] === 'library') {
        // Show library view (full page on mobile, sidebar on desktop)
        state.set('currentView', 'library');
        showView('library');
        initLibraryView();
    } else if (parts[0] === 'settings') {
        // Show settings (open settings drawer)
        state.set('currentView', 'settings');
        showView('import');
        window.dispatchEvent(new CustomEvent('open-settings'));
    } else {
        state.set('currentView', 'import');
        showView('import');
        refreshTree();
    }
}

// ── Init ────────────────────────────────────────────────────────────

export function init() {
    initImportView();
    initReviewView();
    initSourceView();
    initEpisodeView();
}

export { loadEpisode, populateVoiceSelect };
