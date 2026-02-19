/**
 * Settings panel — preferences, tags, generation status.
 * Premium Edition
 */

import { client as api } from './api.ts';
import * as state from './state.js';
import { toast } from './main.js';
import { $, escapeHtml } from './utils.js';

// ── Load settings ───────────────────────────────────────────────────

async function loadSettings() {
    try {
        const settings = await api.getApiStudioSettings();
        state.set('settings', settings);
        applyToForm(settings);
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function applyToForm(settings) {
    // Desktop drawer settings
    if (settings.default_voice) $('setting-voice').value = settings.default_voice;
    if (settings.default_strategy) $('setting-strategy').value = settings.default_strategy;
    if (settings.default_max_chars) $('setting-max-chars').value = settings.default_max_chars;
    if (settings.default_format) $('setting-format').value = settings.default_format;
    if (settings.default_code_rule) $('setting-code-rule').value = settings.default_code_rule;
    if (settings.default_breathing) $('setting-breathing').value = settings.default_breathing;
    if (settings.url_extraction_method) $('setting-url-extraction').value = settings.url_extraction_method;

    const bool = (key, def = false) => {
        const val = settings[key];
        if (val === undefined) return def;
        return val === 'true' || val === true;
    };

    $('setting-clean-remove-non-text').checked = bool('clean_remove_non_text', false);
    $('setting-clean-speak-urls').checked = bool('clean_speak_urls', true);
    $('setting-clean-handle-tables').checked = bool('clean_handle_tables', true);
    $('setting-clean-expand-abbreviations').checked = bool('clean_expand_abbreviations', true);
    $('setting-clean-preserve-parentheses').checked = bool('clean_preserve_parentheses', true);

    $('setting-show-subtitles').checked = bool('show_subtitles', true);
    if (settings.subtitle_mode) $('setting-subtitle-mode').value = settings.subtitle_mode;
    if (settings.subtitle_font_size) {
        $('setting-subtitle-font-size').value = settings.subtitle_font_size;
        $('subtitle-font-value').textContent = settings.subtitle_font_size + 'px';
    }

    // Mobile full-page settings
    if (settings.default_voice) $('setting-voice-mobile').value = settings.default_voice;
    if (settings.default_strategy) $('setting-strategy-mobile').value = settings.default_strategy;
    if (settings.default_max_chars) $('setting-max-chars-mobile').value = settings.default_max_chars;
    if (settings.default_format) $('setting-format-mobile').value = settings.default_format;
    if (settings.default_code_rule) $('setting-code-rule-mobile').value = settings.default_code_rule;
    if (settings.default_breathing) $('setting-breathing-mobile').value = settings.default_breathing;
    if (settings.url_extraction_method) $('setting-url-extraction-mobile').value = settings.url_extraction_method;

    $('setting-clean-remove-non-text-mobile').checked = bool('clean_remove_non_text', false);
    $('setting-clean-speak-urls-mobile').checked = bool('clean_speak_urls', true);
    $('setting-clean-handle-tables-mobile').checked = bool('clean_handle_tables', true);
    $('setting-clean-expand-abbreviations-mobile').checked = bool('clean_expand_abbreviations', true);
    $('setting-clean-preserve-parentheses-mobile').checked = bool('clean_preserve_parentheses', true);

    $('setting-show-subtitles-mobile').checked = bool('show_subtitles', true);
    if (settings.subtitle_mode) $('setting-subtitle-mode-mobile').value = settings.subtitle_mode;
    if (settings.subtitle_font_size) {
        $('setting-subtitle-font-size-mobile').value = settings.subtitle_font_size;
        $('subtitle-font-value-mobile').textContent = settings.subtitle_font_size + 'px';
    }
}

// ── Save settings ───────────────────────────────────────────────────

async function saveSettings() {
    const data = {
        default_voice: $('setting-voice').value || $('setting-voice-mobile').value,
        default_strategy: $('setting-strategy').value || $('setting-strategy-mobile').value,
        default_max_chars: parseInt($('setting-max-chars').value || $('setting-max-chars-mobile').value),
        default_format: $('setting-format').value || $('setting-format-mobile').value,
        default_code_rule: $('setting-code-rule').value || $('setting-code-rule-mobile').value,
        default_breathing: $('setting-breathing').value || $('setting-breathing-mobile').value,
        url_extraction_method: $('setting-url-extraction').value || $('setting-url-extraction-mobile').value,

        clean_remove_non_text: $('setting-clean-remove-non-text').checked ? 'true' : 'false',
        clean_speak_urls: $('setting-clean-speak-urls').checked ? 'true' : 'false',
        clean_handle_tables: $('setting-clean-handle-tables').checked ? 'true' : 'false',
        clean_expand_abbreviations: $('setting-clean-expand-abbreviations').checked ? 'true' : 'false',
        clean_preserve_parentheses: $('setting-clean-preserve-parentheses').checked ? 'true' : 'false',

        show_subtitles: $('setting-show-subtitles').checked ? 'true' : 'false',
        subtitle_mode: $('setting-subtitle-mode').value,
        subtitle_font_size: $('setting-subtitle-font-size').value,
    };

    try {
        await api.putApiStudioSettings(data);
        state.set('settings', data);
        applySubtitleSettings(data);

        // Sync mobile settings display
        applyToForm(data);

        toast('Settings saved', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ── Tags ────────────────────────────────────────────────────────────

async function loadTags() {
    try {
        const tags = await api.getApiStudioTags();
        state.set('tags', tags);
        renderTags(tags);
    } catch (e) {
        console.error('Failed to load tags:', e);
    }
}

function renderTags(tags) {
    const list = $('tags-list');
    list.innerHTML = '';

    for (const tag of tags) {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerHTML = `
            <span>${escapeHtml(tag.name)}</span>
            <button data-id="${tag.id}" title="Delete tag">&times;</button>
        `;

        chip.querySelector('button').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await api.deleteApiStudioTagsTagId(tag.id);
                await loadTags();
                toast('Tag deleted', 'info');
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        list.appendChild(chip);
    }
}
// ── Generation status polling ───────────────────────────────────────

let _statusInterval = null;

function startStatusPolling() {
    _statusInterval = setInterval(async () => {
        try {
            const status = await api.getApiStudioGenerationStatus();
            updateGenerationStatusUI(status);
        } catch {}
    }, 5000);
}

function updateGenerationStatusUI(status) {
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');

    if (!indicator || !statusText) return;

    const isActive = status.current_episode_id || (status.queue_size && status.queue_size > 0);

    if (isActive) {
        indicator.className = 'status-indicator active';
        const current = status.current_episode_id ?
            'Generating...' :
            `${status.queue_size} in queue`;
        statusText.textContent = current;
    } else {
        indicator.className = 'status-indicator idle';
        statusText.textContent = 'Ready';
    }
}

// ── Apply subtitle settings to player ───────────────────────────────────

function applySubtitleSettings(settings) {
    const container = document.getElementById('fs-subtitles-container');
    if (!container) return;

    const show = settings.show_subtitles !== 'false' && settings.show_subtitles !== false;
    container.style.display = show ? 'flex' : 'none';

    const fontSize = settings.subtitle_font_size || '16';
    container.style.setProperty('--subtitle-font-size', fontSize + 'px');
}

// ── Init ────────────────────────────────────────────────────────────

export async function init() {
    // Load voices first and store in state
    const voices = (await api.getV1Voices()).data;
    state.set('voices', voices);

    // Populate voice select
    const voiceSelect = $('setting-voice');
    if (voiceSelect) {
        voiceSelect.innerHTML = '';
        for (const v of voices) {
            const opt = document.createElement('option');
            opt.value = v.id || v.voice_id;
            opt.textContent = `${v.name} (${v.type || 'builtin'})`;
            voiceSelect.appendChild(opt);
        }
    }

    $('btn-save-settings').addEventListener('click', saveSettings);
    $('btn-save-settings-mobile')?.addEventListener('click', saveSettings);

    $('btn-create-tag').addEventListener('click', async () => {
        const name = $('new-tag-name').value.trim();
        if (!name) return;
        try {
            await api.postApiStudioTags({ name });
            $('new-tag-name').value = '';
            await loadTags();
            toast('Tag created', 'success');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    $('btn-create-tag-mobile')?.addEventListener('click', async () => {
        const name = $('new-tag-name-mobile').value.trim();
        if (!name) return;
        try {
            await api.postApiStudioTags({ name });
            $('new-tag-name-mobile').value = '';
            await loadTags();
            toast('Tag created', 'success');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    // Enter key on tag input
    $('new-tag-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            $('btn-create-tag').click();
        }
    });

    // Subtitle font size slider live preview
    $('setting-subtitle-font-size').addEventListener('input', (e) => {
        $('subtitle-font-value').textContent = e.target.value + 'px';
    });

    $('setting-subtitle-font-size-mobile')?.addEventListener('input', (e) => {
        $('subtitle-font-value-mobile').textContent = e.target.value + 'px';
    });

    await loadSettings();
    await loadTags();
    startStatusPolling();
}
