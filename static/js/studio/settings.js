/**
 * Settings panel — preferences, tags, generation status.
 * Premium Edition
 */

import * as api from './api.js';
import * as state from './state.js';
import { toast } from './main.js';
import { populateVoiceSelect } from './editor.js';

const $ = (id) => document.getElementById(id);

// ── Load settings ───────────────────────────────────────────────────

async function loadSettings() {
    try {
        const settings = await api.getSettings();
        state.set('settings', settings);
        applyToForm(settings);
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function applyToForm(settings) {
    if (settings.default_voice) $('setting-voice').value = settings.default_voice;
    if (settings.default_strategy) $('setting-strategy').value = settings.default_strategy;
    if (settings.default_max_chars) $('setting-max-chars').value = settings.default_max_chars;
    if (settings.default_format) $('setting-format').value = settings.default_format;
    if (settings.default_code_rule) $('setting-code-rule').value = settings.default_code_rule;
    if (settings.default_breathing) $('setting-breathing').value = settings.default_breathing;

    // Cleaning settings
    $('setting-clean-remove-non-text').checked = settings.clean_remove_non_text === 'true';
    $('setting-clean-speak-urls').checked = settings.clean_speak_urls === 'true';
    $('setting-clean-handle-tables').checked = settings.clean_handle_tables === 'true';
    $('setting-clean-expand-abbreviations').checked = settings.clean_expand_abbreviations === 'true';
    $('setting-clean-preserve-parentheses').checked = settings.clean_preserve_parentheses !== 'false';

    // Subtitle settings
    $('setting-show-subtitles').checked = settings.show_subtitles !== 'false';
    if (settings.subtitle_mode) $('setting-subtitle-mode').value = settings.subtitle_mode;
    if (settings.subtitle_font_size) {
        $('setting-subtitle-font-size').value = settings.subtitle_font_size;
        $('subtitle-font-value').textContent = settings.subtitle_font_size + 'px';
    }
}

// ── Save settings ───────────────────────────────────────────────────

async function saveSettings() {
    const data = {
        default_voice: $('setting-voice').value,
        default_strategy: $('setting-strategy').value,
        default_max_chars: parseInt($('setting-max-chars').value),
        default_format: $('setting-format').value,
        default_code_rule: $('setting-code-rule').value,
        default_breathing: $('setting-breathing').value,

        // Cleaning settings
        clean_remove_non_text: $('setting-clean-remove-non-text').checked ? 'true' : 'false',
        clean_speak_urls: $('setting-clean-speak-urls').checked ? 'true' : 'false',
        clean_handle_tables: $('setting-clean-handle-tables').checked ? 'true' : 'false',
        clean_expand_abbreviations: $('setting-clean-expand-abbreviations').checked ? 'true' : 'false',
        clean_preserve_parentheses: $('setting-clean-preserve-parentheses').checked ? 'true' : 'false',

        // Subtitle settings
        show_subtitles: $('setting-show-subtitles').checked ? 'true' : 'false',
        subtitle_mode: $('setting-subtitle-mode').value,
        subtitle_font_size: $('setting-subtitle-font-size').value,
    };

    try {
        await api.updateSettings(data);
        state.set('settings', data);
        applySubtitleSettings(data);
        toast('Settings saved', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ── Tags ────────────────────────────────────────────────────────────

async function loadTags() {
    try {
        const tags = await api.listTags();
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
                await api.deleteTag(tag.id);
                await loadTags();
                toast('Tag deleted', 'info');
            } catch (err) {
                toast(err.message, 'error');
            }
        });

        list.appendChild(chip);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Generation status polling ───────────────────────────────────────

let _statusInterval = null;

function startStatusPolling() {
    _statusInterval = setInterval(async () => {
        try {
            const status = await api.generationStatus();
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

    const show = settings.show_subtitles !== 'false';
    container.style.display = show ? 'flex' : 'none';

    const fontSize = settings.subtitle_font_size || '16';
    container.style.setProperty('--subtitle-font-size', fontSize + 'px');
}

// ── Init ────────────────────────────────────────────────────────────

export async function init() {
    await populateVoiceSelect('setting-voice');

    $('btn-save-settings').addEventListener('click', saveSettings);

    $('btn-create-tag').addEventListener('click', async () => {
        const name = $('new-tag-name').value.trim();
        if (!name) return;
        try {
            await api.createTag(name);
            $('new-tag-name').value = '';
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

    await loadSettings();
    await loadTags();
    startStatusPolling();
}
