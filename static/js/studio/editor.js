/**
 * Editor panel — import, source detail, episode detail views.
 * Premium Edition with enhanced UX
 */

import { client as api } from './api.ts';
import * as state from './state.js';
import { toast, confirm as confirmDialog, showUndoToast } from './main.js';
import { refreshTree } from './library.js';
import { loadEpisode as playerLoadEpisode } from './player.js';
import { escapeHtml, formatTime } from './utils.js';
import { clearContent, createElement, createPills } from './dom.js';

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
    const dropzoneDefault = document.getElementById('dropzone-content-default');
    const dropzoneSelected = document.getElementById('dropzone-content-selected');
    const selectedFilename = document.getElementById('selected-filename');

    function updateFileDisplay() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (selectedFilename) {
                selectedFilename.textContent = file.name;
            }
            dropzoneDefault?.classList.add('hidden');
            dropzoneSelected?.classList.remove('hidden');
            dropzoneSelected?.classList.add('dropzone-content-selected');
        } else {
            dropzoneDefault?.classList.remove('hidden');
            dropzoneSelected?.classList.add('hidden');
            dropzoneSelected?.classList.remove('dropzone-content-selected');
        }
    }

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
                updateFileDisplay();
                toast(`File selected: ${files[0].name}`, 'info');
            }
        });

        fileInput.addEventListener('change', () => {
            updateFileDisplay();
            if (fileInput.files.length > 0) {
                toast(`File selected: ${fileInput.files[0].name}`, 'info');
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
        const activeBtn = document.querySelector('.method-btn.active');
        const activeTab = activeBtn ? activeBtn.dataset.tab : null;

        const settings = state.get('settings') || {};
        const rule = settings.default_code_rule || 'skip';

        try {
            let rawText, cleanedText, title, totalChars;

            if (activeTab === 'paste') {
                const text = document.getElementById('import-text').value.trim();
                if (!text) return toast('Enter some text first', 'error');
                const result = await api.postApiStudioPreviewClean({ text, code_block_rule: rule });
                rawText = text;
                cleanedText = result.cleaned_text;
                title = document.getElementById('import-title').value.trim() || null;
                totalChars = text.length;
            } else if (activeTab === 'file') {
                const fileInput = document.getElementById('import-file');
                if (!fileInput.files.length) return toast('Select a file first', 'error');
                const file = fileInput.files[0];
                const text = await file.text();
                const result = await api.postApiStudioPreviewClean({ text, code_block_rule: rule });
                rawText = text;
                cleanedText = result.cleaned_text;
                title = file.name;
                totalChars = text.length;
            } else if (activeTab === 'url') {
                const url = document.getElementById('import-url').value.trim();
                if (!url) return toast('Enter a URL first', 'error');
                const result = await api.postApiStudioPreviewContent({ type: 'url', url });
                rawText = result.raw_text;
                cleanedText = result.cleaned_text;
                title = result.title;
                totalChars = result.total_chars;
            } else if (activeTab === 'git') {
                const url = document.getElementById('import-git-url').value.trim();
                if (!url) return toast('Enter a git repository URL first', 'error');
                const subpath = document.getElementById('import-git-subpath').value.trim() || null;
                const result = await api.postApiStudioPreviewContent({ type: 'git', url, subpath });
                rawText = result.preview_text;
                cleanedText = result.preview_text;
                title = result.suggested_title;
                totalChars = result.total_chars;
            } else {
                return toast('Select an import method first', 'error');
            }

            document.getElementById('preview-raw').textContent = rawText.substring(0, 5000);
            document.getElementById('preview-cleaned').textContent = cleanedText.substring(0, 5000);
            document.getElementById('raw-stats').textContent = `${totalChars.toLocaleString()} chars`;
            document.getElementById('cleaned-stats').textContent = `${cleanedText.length.toLocaleString()} chars`;

            // Update title in preview if available
            const titleEl = document.getElementById('preview-title');
            if (titleEl && title) {
                titleEl.textContent = title;
                titleEl.parentElement.classList.remove('hidden');
            }

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

function _getImportText() {
    const activeBtn = document.querySelector('.method-btn.active');
    if (!activeBtn) return null;
    const activeTab = activeBtn.dataset.tab;
    if (activeTab === 'paste') return document.getElementById('import-text').value;
    if (activeTab === 'url') return document.getElementById('import-url').value.trim();
    if (activeTab === 'git') return document.getElementById('import-git-url').value.trim();
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
            result = await api.postApiStudioSources({ text, title, cleaning_settings: { code_block_rule: rule } });
        } else if (activeTab === 'file') {
            const fileInput = document.getElementById('import-file');
            if (!fileInput.files.length) return toast('Select a file', 'error');
            const form = new FormData();
            form.append('file', fileInput.files[0]);
            form.append('code_block_rule', rule);
            result = await api.postApiStudioSources(form);
        } else if (activeTab === 'url') {
            const url = document.getElementById('import-url').value.trim();
            if (!url) return toast('Enter a URL', 'error');
            const urlExtractionMethod = (settings.url_extraction_method || 'jina');
            result = await api.postApiStudioSources({ url, url_settings: { use_jina: urlExtractionMethod === 'jina', jina_fallback: false }, cleaning_settings: { code_block_rule: rule } });
        } else if (activeTab === 'git') {
            const url = document.getElementById('import-git-url').value.trim();
            if (!url) return toast('Enter a git repository URL', 'error');
            const subpath = document.getElementById('import-git-subpath').value.trim() || null;
            result = await api.postApiStudioSources({ git_url: url, git_subpath: subpath, cleaning_settings: { code_block_rule: rule } });
        }

        toast(`Imported: ${result.title}`, 'success');
        refreshTree();
        window.location.hash = `#review/${result.id}`;

        // Clear form
        document.getElementById('import-text').value = '';
        document.getElementById('import-title').value = '';
        document.getElementById('import-url').value = '';
        document.getElementById('import-git-url').value = '';
        document.getElementById('import-git-subpath').value = '';
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
        const source = await api.getApiStudioSourcesSourceId(sourceId);

        document.getElementById('review-title').textContent = source.title;
        document.getElementById('review-breadcrumb').textContent = source.title;
        const reviewMeta = document.getElementById('review-meta');
        reviewMeta.innerHTML = '';
        reviewMeta.appendChild(createPills([
            { text: source.source_type, className: '' },
            { text: `${source.cleaned_text.length.toLocaleString()} chars`, className: '' }
        ]));
        document.getElementById('review-cleaned-text').textContent = source.cleaned_text;
        document.getElementById('review-cleaned-textarea').value = source.cleaned_text;

        // Show Edit button
        document.getElementById('btn-edit-text').style.display = 'inline-flex';

        // Load cover art
        const coverImage = document.getElementById('review-cover-image');
        const coverPlaceholder = document.getElementById('review-cover-placeholder');
        if (source.cover_art) {
            coverImage.src = `/api/studio/sources/${sourceId}/cover`;
            coverImage.onload = () => {
                coverImage.classList.remove('hidden');
                coverPlaceholder.classList.add('hidden');
            };
            coverImage.onerror = () => {
                coverImage.classList.add('hidden');
                coverPlaceholder.classList.remove('hidden');
            };
        } else {
            coverImage.classList.add('hidden');
            coverPlaceholder.classList.remove('hidden');
        }

        // Set up cover upload
        const coverInput = document.getElementById('review-cover-input');
        const uploadCoverBtn = document.getElementById('btn-upload-cover');

        uploadCoverBtn.onclick = () => coverInput.click();
        coverInput.onchange = async () => {
            const file = coverInput.files[0];
            if (!file) return;

            try {
                await api.postApiStudioSourcesSourceIdCover(sourceId, { cover: file });

                coverImage.src = `/api/studio/sources/${sourceId}/cover?t=${Date.now()}`;
                coverImage.onload = () => {
                    coverImage.classList.remove('hidden');
                    coverPlaceholder.classList.add('hidden');
                };
                toast('Cover uploaded', 'success');
            } catch (_e) {
                toast('Failed to upload cover', 'error');
            }
        };

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
        const source = await api.getApiStudioSourcesSourceId(id);
        const strategy = document.getElementById('review-strategy').value;
        const maxChars = parseInt(document.getElementById('review-max-chars').value);

        try {
            const result = await api.postApiStudioPreviewChunks({ text: source.cleaned_text, strategy, max_chars: maxChars });
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
            const result = await api.postApiStudioEpisodes(data);
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

    // Mobile generate button (header)
    const mobileGenerateBtn = document.getElementById('btn-review-generate-header');
    if (mobileGenerateBtn) {
        mobileGenerateBtn.addEventListener('click', async () => {
            const sourceId = state.get('currentSourceId');
            const btn = mobileGenerateBtn;
            const originalContent = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
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
                const result = await api.postApiStudioEpisodes(data);
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

    // Edit text functionality
    const editBtn = document.getElementById('btn-edit-text');
    const saveBtn = document.getElementById('btn-save-text');
    const cancelBtn = document.getElementById('btn-cancel-edit');
    const textPreview = document.getElementById('review-cleaned-text');
    const textArea = document.getElementById('review-cleaned-textarea');
    const editActions = document.getElementById('review-edit-actions');

    editBtn.addEventListener('click', () => {
        textPreview.classList.add('hidden');
        textArea.classList.remove('hidden');
        editActions.classList.remove('hidden');
        editBtn.style.display = 'none';
        textArea.focus();
    });

    saveBtn.addEventListener('click', async () => {
        const sourceId = state.get('currentSourceId');
        const newText = textArea.value;
        try {
            await api.putApiStudioSourcesSourceId(sourceId, { cleaned_text: newText });
            textPreview.textContent = newText;
            const metaEl = document.getElementById('review-meta');
            metaEl.innerHTML = '';
            metaEl.appendChild(createPills([
                { text: 'text', className: '' },
                { text: `${newText.length.toLocaleString()} chars`, className: '' }
            ]));
            textPreview.classList.remove('hidden');
            textArea.classList.add('hidden');
            editActions.classList.add('hidden');
            editBtn.style.display = 'inline-flex';
            toast('Text saved', 'success');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    cancelBtn.addEventListener('click', () => {
        textArea.value = textPreview.textContent;
        textPreview.classList.remove('hidden');
        textArea.classList.add('hidden');
        editActions.classList.add('hidden');
        editBtn.style.display = 'inline-flex';
    });
}

function renderChunkPreview(chunks, prefix = '') {
    const container = document.getElementById(`${prefix}-chunk-list`);
    clearContent(container);
    document.getElementById(`${prefix}-chunk-count`).textContent = chunks.length;
    document.getElementById(`${prefix}-chunk-preview`).classList.remove('hidden');

    for (const chunk of chunks) {
        const card = createElement('div', { className: 'chunk-item' }, [
            createElement('div', { className: 'chunk-header' }, [
                createElement('span', { className: 'chunk-label' }, [chunk.label]),
                createElement('span', { className: 'chunk-stats' }, [`${chunk.text.length} chars`])
            ]),
            createElement('div', { className: 'chunk-preview-text' }, [
                escapeHtml(chunk.text.substring(0, 200)) + (chunk.text.length > 200 ? '...' : '')
            ])
        ]);
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
        const source = await api.getApiStudioSourcesSourceId(sourceId);

        document.getElementById('source-title').textContent = source.title;
        document.getElementById('source-breadcrumb').textContent = source.title;
        const sourceMeta = document.getElementById('source-meta');
        sourceMeta.innerHTML = '';
        sourceMeta.appendChild(createPills([
            { text: source.source_type, className: '' },
            { text: `${source.cleaned_text.length.toLocaleString()} chars`, className: '' },
            { text: new Date(source.created_at).toLocaleDateString(), className: '' }
        ]));
        document.getElementById('source-cleaned-text').textContent = source.cleaned_text;
        document.getElementById('source-cleaned-textarea').value = source.cleaned_text;

    } catch (e) {
        toast(e.message, 'error');
    }

    refreshTree();
}

function initSourceView() {
    // Edit text functionality for source view
    const _editBtn = document.getElementById('btn-edit-text');
    const _textPreview = document.getElementById('source-cleaned-text');
    const _textArea = document.getElementById('source-cleaned-textarea');
    const _editActions = document.getElementById('source-edit-actions');

    // For source view, we need a different approach - let's add a button dynamically
    // Actually let's add it in the HTML template and show it here

    // Source view edit text functionality
    const sourceEditBtn = document.getElementById('btn-edit-source-text');
    const sourceSaveBtn = document.getElementById('btn-save-source-text');
    const sourceCancelBtn = document.getElementById('btn-cancel-source-edit');
    const sourceTextPreview = document.getElementById('source-cleaned-text');
    const sourceTextArea = document.getElementById('source-cleaned-textarea');
    const sourceEditActions = document.getElementById('source-edit-actions');

    if (sourceEditBtn) {
        sourceEditBtn.addEventListener('click', () => {
            sourceTextPreview.classList.add('hidden');
            sourceTextArea.classList.remove('hidden');
            sourceEditActions.classList.remove('hidden');
            sourceEditBtn.style.display = 'none';
            sourceTextArea.focus();
        });
    }

    if (sourceSaveBtn) {
        sourceSaveBtn.addEventListener('click', async () => {
            const sourceId = state.get('currentSourceId');
            const newText = sourceTextArea.value;
            try {
                await api.putApiStudioSourcesSourceId(sourceId, { cleaned_text: newText });
                sourceTextPreview.textContent = newText;
                const sourceMetaEl = document.getElementById('source-meta');
                sourceMetaEl.innerHTML = '';
                sourceMetaEl.appendChild(createPills([
                    { text: 'text', className: '' },
                    { text: `${newText.length.toLocaleString()} chars`, className: '' },
                    { text: new Date().toLocaleDateString(), className: '' }
                ]));
                sourceTextPreview.classList.remove('hidden');
                sourceTextArea.classList.add('hidden');
                sourceEditActions.classList.add('hidden');
                sourceEditBtn.style.display = 'inline-flex';
                toast('Text saved', 'success');
            } catch (e) {
                toast(e.message, 'error');
            }
        });
    }

    if (sourceCancelBtn) {
        sourceCancelBtn.addEventListener('click', () => {
            sourceTextArea.value = sourceTextPreview.textContent;
            sourceTextPreview.classList.remove('hidden');
            sourceTextArea.classList.add('hidden');
            sourceEditActions.classList.add('hidden');
            sourceEditBtn.style.display = 'inline-flex';
        });
    }

    // Re-clean
    document.getElementById('btn-reclean').addEventListener('click', async () => {
        const id = state.get('currentSourceId');
        const rule = document.getElementById('source-reclean-rule').value;
        try {
            const result = await api.postApiStudioSourcesSourceIdReClean(id, { code_block_rule: rule });
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
            await api.deleteApiStudioSourcesSourceId(id);
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
        const episode = await api.getApiStudioEpisodesEpisodeId(episodeId);
        renderEpisode(episode);

        // Auto-refresh while generating
        if (episode.status === 'pending' || episode.status === 'generating') {
            episodeRefreshInterval = setInterval(async () => {
                try {
                    const fresh = await api.getApiStudioEpisodesEpisodeId(episodeId);
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
    const errorChunks = episode.chunks?.filter(c => c.status === 'error') || [];
    const errorCount = errorChunks.length;

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
        const firstError = errorChunks[0]?.error_message || 'Unknown error';
        genStageEl.textContent = `Generation failed (${errorCount} chunk${errorCount > 1 ? 's' : ''})`;
        genStageEl.className = 'gen-stage error';
        genChunkInfoEl.textContent = firstError.length > 100 ? firstError.substring(0, 100) + '...' : firstError;
    }

    // Show/hide Cancel and Retry buttons
    const cancelBtn = document.getElementById('btn-cancel-episode');
    const retryBtn = document.getElementById('btn-retry-errors');
    if (episode.status === 'generating' || episode.status === 'pending') {
        cancelBtn.style.display = 'inline-flex';
    } else {
        cancelBtn.style.display = 'none';
    }
    if (errorCount > 0) {
        retryBtn.style.display = 'inline-flex';
        retryBtn.textContent = `Retry Failed (${errorCount})`;
    } else {
        retryBtn.style.display = 'none';
    }

    // Chunks grid
    const container = document.getElementById('episode-chunks');
    clearContent(container);

    for (const chunk of (episode.chunks || [])) {
        const card = createElement('div', { className: 'chunk-card' });
        card.dataset.index = chunk.chunk_index;
        if (state.get('playingEpisodeId') === episode.id &&
            state.get('playingChunkIndex') === chunk.chunk_index) {
            card.classList.add('playing');
        }

        const isLongText = chunk.text.length > 150;

        const header = createElement('div', { className: 'chunk-card-header' }, [
            createElement('span', { className: 'chunk-num' }, [String(chunk.chunk_index + 1)]),
            createElement('span', { className: `chunk-status ${chunk.status}` }, [chunk.status])
        ]);
        card.appendChild(header);

        if (chunk.status === 'error' && chunk.error_message) {
            const errorDiv = createElement('div', { className: 'chunk-error' }, [
                escapeHtml(chunk.error_message.substring(0, 120)) + (chunk.error_message.length > 120 ? '...' : '')
            ]);
            card.appendChild(errorDiv);
        }

        const textDiv = createElement('div', { className: 'chunk-text', data_full_text: escapeHtml(chunk.text) }, [
            escapeHtml(chunk.text.substring(0, 150)) + (isLongText ? '...' : '')
        ]);
        card.appendChild(textDiv);

        if (isLongText) {
            const expandIndicator = createElement('div', { className: 'chunk-expand-indicator' }, ['Click to expand']);
            card.appendChild(expandIndicator);
        }

        const footer = createElement('div', { className: 'chunk-footer' }, [
            createElement('span', { className: 'chunk-duration' }, [chunk.duration_secs ? formatTime(chunk.duration_secs) : '—'])
        ]);

        const actionsDiv = createElement('div', { className: 'chunk-actions' });
        if (chunk.status === 'ready') {
            const playBtn = createElement('button', { className: 'chunk-btn play-chunk', title: 'Play', data_index: chunk.chunk_index });
            playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playerLoadEpisode(episode.id, chunk.chunk_index);
            });
            actionsDiv.appendChild(playBtn);
        }
        if (chunk.status === 'error' || chunk.status === 'ready') {
            const regenBtn = createElement('button', { className: 'chunk-btn regen-chunk', title: 'Regenerate', data_index: chunk.chunk_index });
            regenBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
            regenBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await api.postApiStudioEpisodesEpisodeIdChunksChunkIndexRegenerate(episode.id, chunk.chunk_index);
                toast('Chunk queued for regeneration', 'info');
                loadEpisode(episode.id);
            });
            actionsDiv.appendChild(regenBtn);
        }
        footer.appendChild(actionsDiv);
        card.appendChild(footer);

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

        const voices = state.get('voices') || (await api.getV1Voices()).data;
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
            const result = await api.postApiStudioEpisodesEpisodeIdRegenerateWithSettings(currentRegenEpisodeId, settings);

            regenModal.classList.add('hidden');

            if (result.undo_id) {
                showUndoToast(
                    'Episode queued for regeneration',
                    async () => {
                        try {
                            await api.postApiStudioUndoUndoId(result.undo_id);
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
            await api.postApiStudioEpisodesEpisodeIdRegenerate(id);
            toast('Episode queued for regeneration', 'info');
            loadEpisode(id);
        }
    });

    document.getElementById('btn-cancel-episode').addEventListener('click', async () => {
        const id = state.get('currentEpisodeId');
        const ok = await confirmDialog('Cancel Generation', 'Stop generation and reset error chunks to pending?');
        if (ok) {
            await api.postApiStudioEpisodesEpisodeIdCancel(id);
            toast('Generation cancelled', 'info');
            loadEpisode(id);
        }
    });

    document.getElementById('btn-retry-errors').addEventListener('click', async () => {
        const id = state.get('currentEpisodeId');
        await api.postApiStudioEpisodesEpisodeIdRetryErrors(id);
        toast('Retrying failed chunks', 'info');
        loadEpisode(id);
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
            await api.deleteApiStudioEpisodesEpisodeId(id);
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
        voices = (await api.getV1Voices()).data;
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
            clearContent(container);
            for (const ep of episodes) {
                const card = createElement('div', { className: 'library-card', data_episode_id: ep.id, data_chunk_index: 0 });
                card.innerHTML = '<div class="library-card-artwork"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>';
                const info = createElement('div', { className: 'library-card-info' }, [
                    createElement('h4', {}, [escapeHtml(ep.title)]),
                    createElement('p', {}, [`${ep.chunk_count || 0} chunks`])
                ]);
                card.appendChild(info);
                const status = createElement('span', { className: `library-card-status ${ep.status}` }, [ep.status]);
                card.appendChild(status);
                card.addEventListener('click', () => {
                    window.location.hash = `#episode/${ep.id}`;
                });
                container.appendChild(card);
            }
        }

        // Load sources
        const sourcesRes = await fetch('/api/studio/sources');
        const sources = await sourcesRes.json();

        if (sources.length === 0) {
            sourcesContainer.innerHTML = '<div class="empty-state"><p>No sources yet</p></div>';
        } else {
            clearContent(sourcesContainer);
            for (const src of sources) {
                const card = createElement('div', { className: 'library-card', data_source_id: src.id });
                card.innerHTML = '<div class="library-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
                const info = createElement('div', { className: 'library-card-info' }, [
                    createElement('h4', {}, [escapeHtml(src.title)]),
                    createElement('p', {}, [src.source_type])
                ]);
                card.appendChild(info);
                card.addEventListener('click', () => {
                    window.location.hash = `#source/${src.id}`;
                });
                sourcesContainer.appendChild(card);
            }
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
        // Show settings (full page on mobile, drawer on desktop)
        state.set('currentView', 'settings');
        if (window.innerWidth <= 1024) {
            showView('settings');
        } else {
            showView('import');
            window.dispatchEvent(new CustomEvent('open-settings'));
        }
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
