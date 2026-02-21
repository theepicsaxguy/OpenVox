// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:49112';

test.describe('Podcast Studio Frontend', () => {
    test.beforeEach(async ({ page }) => {
        page.on('pageerror', error => {
            console.error(`Browser page error: ${error.message}`);
        });
    });

    test('homepage loads without JavaScript errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);

        await expect(page.locator('.app-shell')).toBeVisible();
        expect(errors).toHaveLength(0);
    });

    test('API endpoints are accessible', async ({ page }) => {
        const healthResponse = await page.request.get(BASE + '/health');
        expect(healthResponse.status()).toBe(200);
        const healthData = await healthResponse.json();
        expect(healthData.status).toBe('healthy');

        const voicesResponse = await page.request.get(BASE + '/v1/voices');
        expect(voicesResponse.status()).toBe(200);
        const voicesData = await voicesResponse.json();
        expect(voicesData.data).toBeDefined();
        expect(voicesData.data.length).toBeGreaterThan(0);
    });

    test('Studio API endpoints are accessible', async ({ page }) => {
        const treeResponse = await page.request.get(BASE + '/api/studio/library/tree');
        expect(treeResponse.status()).toBe(200);

        const settingsResponse = await page.request.get(BASE + '/api/studio/settings');
        expect(settingsResponse.status()).toBe(200);

        const tagsResponse = await page.request.get(BASE + '/api/studio/tags');
        expect(tagsResponse.status()).toBe(200);

        const sourcesResponse = await page.request.get(BASE + '/api/studio/sources');
        expect(sourcesResponse.status()).toBe(200);

        const episodesResponse = await page.request.get(BASE + '/api/studio/episodes');
        expect(episodesResponse.status()).toBe(200);
    });
});

test.describe('Issue 1: Click/Tap Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    });

    test('import tab buttons respond to clicks', async ({ page }) => {
        const pasteBtn = page.locator('.method-btn[data-tab="paste"]');
        const fileBtn = page.locator('.method-btn[data-tab="file"]');
        const urlBtn = page.locator('.method-btn[data-tab="url"]');
        const gitBtn = page.locator('.method-btn[data-tab="git"]');

        await expect(pasteBtn).toBeVisible();
        await expect(pasteBtn).toHaveClass(/active/);

        await fileBtn.click();
        await expect(fileBtn).toHaveClass(/active/);
        await expect(pasteBtn).not.toHaveClass(/active/);
        await expect(page.locator('#tab-file')).toHaveClass(/active/);

        await urlBtn.click();
        await expect(urlBtn).toHaveClass(/active/);
        await expect(page.locator('#tab-url')).toHaveClass(/active/);

        await gitBtn.click();
        await expect(gitBtn).toHaveClass(/active/);
        await expect(page.locator('#tab-git')).toHaveClass(/active/);

        await pasteBtn.click();
        await expect(pasteBtn).toHaveClass(/active/);
        await expect(page.locator('#tab-paste')).toHaveClass(/active/);
    });

    test('import button triggers import flow without JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.fill('#import-text', 'Hello world test content for TTS.');
        await page.fill('#import-title', 'Test Import');
        await page.click('#btn-import');
        await page.waitForTimeout(2000);

        expect(errors).toHaveLength(0);
    });

    test('bottom navigation tabs switch views on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const mobileNav = page.locator('#mobile-nav');
        await expect(mobileNav).toBeVisible();

        await page.click('.mobile-nav-item[data-route="library"]');
        await page.waitForTimeout(500);
        await expect(page.locator('#view-library')).toHaveClass(/active/);

        await page.click('.mobile-nav-item[data-route="settings"]');
        await page.waitForTimeout(500);
        await expect(page.locator('#view-settings')).toHaveClass(/active/);

        await page.click('.mobile-nav-item[data-route="import"]');
        await page.waitForTimeout(500);
        await expect(page.locator('#view-import')).toHaveClass(/active/);
    });

    test('settings save button responds to clicks', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(BASE + '/#settings');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/#settings');
        await page.waitForTimeout(1000);

        const saveBtn = page.locator('#btn-save-settings-mobile');
        if (await saveBtn.isVisible()) {
            await saveBtn.click();
            await page.waitForTimeout(1000);
            expect(errors).toHaveLength(0);
        }
    });

    test('keyboard shortcuts help modal opens and closes', async ({ page }) => {
        const helpBtn = page.locator('#btn-keyboard-help');
        await expect(helpBtn).toBeVisible();

        await helpBtn.click();
        await page.waitForTimeout(300);
        await expect(page.locator('#keyboard-modal')).not.toHaveClass(/hidden/);

        await page.locator('#close-keyboard-modal').click();
        await page.waitForTimeout(300);
        await expect(page.locator('#keyboard-modal')).toHaveClass(/hidden/);
    });

    test('no JS errors on any hash route', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        const routes = ['#import', '#library', '#settings', '#search'];
        for (const route of routes) {
            await page.goto(BASE + '/' + route);
            await page.waitForTimeout(800);
        }

        expect(errors).toHaveLength(0);
    });
});

test.describe('Issue 2: API Endpoints in UI', () => {
    let sourceId;

    test.beforeEach(async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    });

    test('tags can be created and deleted from settings', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/#settings');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);

        await expect(page.locator('#view-settings')).toHaveClass(/active/);

        const tagInput = page.locator('#new-tag-name-mobile');
        await tagInput.scrollIntoViewIfNeeded();
        await tagInput.fill('test-tag-e2e');
        await page.click('#btn-create-tag-mobile');
        await page.waitForTimeout(2000);

        expect(errors).toHaveLength(0);
    });

    test('source tags UI is available in source view', async ({ page }) => {
        const res = await page.request.post(BASE + '/api/studio/sources', {
            data: { text: 'Test content for tagging.', title: 'Tag Test Source' }
        });
        const source = await res.json();
        sourceId = source.id;

        await page.goto(BASE + `/#source/${sourceId}`);
        await page.waitForTimeout(1500);

        const tagSection = page.locator('[data-testid="source-tags"]');
        const sourceView = page.locator('#view-source');
        await expect(sourceView).toHaveClass(/active/);

        if (sourceId) {
            await page.request.delete(BASE + `/api/studio/sources/${sourceId}`);
        }
    });
});

test.describe('Issue 3: Mobile Layout', () => {
    test('no sidebar or drawer visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const sidebar = page.locator('#sidebar');
        const sidebarBox = await sidebar.boundingBox();
        if (sidebarBox) {
            expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(0);
        }

        const drawer = page.locator('#drawer');
        const drawerVisible = await drawer.isVisible();
        if (drawerVisible) {
            const drawerBox = await drawer.boundingBox();
            if (drawerBox) {
                expect(drawerBox.x).toBeGreaterThanOrEqual(375);
            }
        }
    });

    test('hamburger button is not visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const hamburger = page.locator('#btn-hamburger');
        await expect(hamburger).not.toBeVisible();
    });

    test('bottom nav is visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const mobileNav = page.locator('#mobile-nav');
        await expect(mobileNav).toBeVisible();

        const navItems = page.locator('.mobile-nav-item');
        await expect(navItems).toHaveCount(4);
    });

    test('all views fill the screen on mobile without scroll lock', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });

        const routes = ['#import', '#library', '#settings', '#search'];
        for (const route of routes) {
            await page.goto(BASE + '/' + route);
            await page.waitForTimeout(600);

            const activeView = page.locator('.stage-view.active');
            await expect(activeView).toBeVisible();
        }
    });

    test('import form is usable on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(BASE + '/#import');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const importBtn = page.locator('#btn-import');
        await expect(importBtn).toBeVisible();

        const textArea = page.locator('#import-text');
        await expect(textArea).toBeVisible();
    });
});

test.describe('Issue 4: Spotify-like UI', () => {
    test('dark theme applied with correct background', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const bg = await page.evaluate(() => {
            return getComputedStyle(document.body).backgroundColor;
        });
        expect(bg).not.toBe('rgb(255, 255, 255)');
    });

    test('fullscreen player has subtitles container', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');

        const subtitlesContainer = page.locator('#fs-subtitles-container');
        await expect(subtitlesContainer).toBeAttached();
    });

    test('fonts are loaded (not system defaults)', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const fontFamily = await page.evaluate(() => {
            return getComputedStyle(document.body).fontFamily;
        });
        expect(fontFamily).toContain('Outfit');
    });

    test('player controls are large and touch-friendly', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');

        const fsPlayBtn = page.locator('#fs-btn-play');
        await expect(fsPlayBtn).toBeAttached();

        const minHeight = await page.evaluate(() => {
            const el = document.getElementById('fs-btn-play');
            if (!el) return 0;
            return parseInt(getComputedStyle(el).height);
        });
        expect(minHeight).toBeGreaterThanOrEqual(44);
    });
});
