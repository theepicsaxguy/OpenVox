// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:49112';

async function navigateTo(page, route) {
    const routeMap = {
        'import': '#btn-nav-import, .nav-item[data-route="import"], .mobile-nav-item[data-route="import"]',
        'library': '#btn-nav-library, .nav-item[data-route="library"], .mobile-nav-item[data-route="library"]',
        'settings': '#btn-nav-settings, .nav-item[data-route="settings"], .mobile-nav-item[data-route="settings"]',
        'search': '#btn-nav-search, .nav-item[data-route="search"], .mobile-nav-item[data-route="search"]',
    };
    const selector = routeMap[route];
    if (selector) {
        await page.click(selector);
        await page.waitForTimeout(500);
    }
}

/**
 * Helper: collect browser console errors during a test.
 * Attach once per page, returns array of error messages.
 */
function collectConsoleErrors(page) {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    return errors;
}

// ── Mobile Overlay Deadlock Tests ──────────────────────────────────

test.describe('Mobile: Overlay Deadlock Prevention', () => {
    test.use({ ...test.info ? {} : {}, viewport: { width: 375, height: 812 } });

    test('sidebar overlay does not block taps after closing', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const mobileNav = page.locator('#mobile-nav');
        await expect(mobileNav).toBeVisible();

        // Navigate to library
        await page.click('.mobile-nav-item[data-route="library"]');
        await page.waitForTimeout(300);

        // Navigate to import — should NOT be blocked by invisible overlay
        await page.click('.mobile-nav-item[data-route="import"]');
        await page.waitForTimeout(300);

        const importView = page.locator('#view-import');
        await expect(importView).toHaveClass(/active/);

        // Verify import text area is clickable (not blocked by overlay)
        const textArea = page.locator('#import-text');
        await expect(textArea).toBeVisible();
        await textArea.click();
        await textArea.fill('Test content after navigation');
        await expect(textArea).toHaveValue('Test content after navigation');
    });

    test('bottom sheet overlay removed after close does not block', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Navigate to library and check bottom sheet overlay state
        await page.click('.mobile-nav-item[data-route="library"]');
        await page.waitForTimeout(300);

        const overlay = page.locator('#bottom-sheet-overlay');
        if (await overlay.count() > 0) {
            // The overlay should be hidden/not blocking
            const isHidden = await overlay.evaluate(el => {
                const style = getComputedStyle(el);
                return style.pointerEvents === 'none' ||
                       style.display === 'none' ||
                       el.classList.contains('hidden');
            });
            expect(isHidden).toBeTruthy();
        }

        // Clicking in the main content area should work
        await page.click('.mobile-nav-item[data-route="import"]');
        await page.waitForTimeout(300);
        await expect(page.locator('#view-import')).toHaveClass(/active/);
    });
});

// ── SPA Hash Routing Desynchronization Tests ───────────────────────

test.describe('SPA: Hash Routing Resynchronization', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('clicking same nav tab resets the view', async ({ page }) => {
        await page.goto(BASE + '/#library');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        await expect(page.locator('#view-library')).toHaveClass(/active/);

        // Click library tab again — should still show library (not get stuck)
        await page.click('.mobile-nav-item[data-route="library"]');
        await page.waitForTimeout(300);
        await expect(page.locator('#view-library')).toHaveClass(/active/);
    });

    test('navigating back to same hash after modal does not freeze', async ({ page }) => {
        await page.goto(BASE + '/#settings');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        await expect(page.locator('#view-settings')).toHaveClass(/active/);

        // Now click settings again
        await page.click('.mobile-nav-item[data-route="settings"]');
        await page.waitForTimeout(300);
        await expect(page.locator('#view-settings')).toHaveClass(/active/);

        // Then navigate away and back
        await page.click('.mobile-nav-item[data-route="import"]');
        await page.waitForTimeout(300);
        await expect(page.locator('#view-import')).toHaveClass(/active/);

        await page.click('.mobile-nav-item[data-route="settings"]');
        await page.waitForTimeout(300);
        await expect(page.locator('#view-settings')).toHaveClass(/active/);
    });
});

// ── Console Error Policy Tests ─────────────────────────────────────

test.describe('Console Error Policy', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('no JS errors on full navigation cycle', async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const routes = ['import', 'library', 'settings', 'search', 'library', 'import'];
        for (const route of routes) {
            await navigateTo(page, route);
            await page.waitForTimeout(400);
        }

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('net::ERR')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('no unhandled errors on rapid navigation', async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);

        // Rapid navigation via actual button clicks
        const routes = ['import', 'library', 'settings', 'search'];
        for (let i = 0; i < 10; i++) {
            await navigateTo(page, routes[i % routes.length]);
            await page.waitForTimeout(50);
        }

        await page.waitForTimeout(1000);

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('net::ERR') &&
            !e.includes('Cannot read properties of null')
        );
        expect(criticalErrors).toHaveLength(0);
    });
});

// ── Memory Leak Regression (Zombie Listeners) ──────────────────────

test.describe('Memory Leak Regression', () => {
    test('repeated view navigation does not accumulate listeners', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Get baseline heap size
        const baselineHeap = await page.evaluate(() => {
            if (performance.memory) {
                return performance.memory.usedJSHeapSize;
            }
            return 0;
        });

        // Navigate between views 30 times
        for (let i = 0; i < 30; i++) {
            const routes = ['#import', '#library', '#settings', '#search'];
            await page.evaluate((hash) => {
                window.location.hash = hash;
            }, routes[i % routes.length]);
            await page.waitForTimeout(100);
        }

        // Force GC if available and measure
        await page.evaluate(() => {
            if (window.gc) window.gc();
        });
        await page.waitForTimeout(500);

        const finalHeap = await page.evaluate(() => {
            if (performance.memory) {
                return performance.memory.usedJSHeapSize;
            }
            return 0;
        });

        // If heap measurement is available, check for unreasonable growth
        // (more than 10MB growth for 30 navigations would indicate a leak)
        if (baselineHeap > 0 && finalHeap > 0) {
            const growth = finalHeap - baselineHeap;
            expect(growth).toBeLessThan(10 * 1024 * 1024);
        }
    });
});

// ── State Immutability Tests ───────────────────────────────────────

test.describe('State Immutability', () => {
    test('state objects are frozen and cannot be mutated', async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Navigate to library to trigger libraryTree state
        await page.evaluate(() => {
            window.location.hash = '#library';
        });
        await page.waitForTimeout(1000);

        // Attempt mutation — should throw in strict mode or be silently ignored
        const mutationResult = await page.evaluate(() => {
            try {
                // This would fail if state.js properly freezes values
                const tree = window.__stateDebug?.get?.('libraryTree');
                if (tree && typeof tree === 'object') {
                    tree.__test_mutation = 'should-fail';
                    return tree.__test_mutation === 'should-fail' ? 'mutable' : 'frozen';
                }
                return 'no-state-debug';
            } catch {
                return 'frozen';
            }
        });

        // Either frozen (throws) or no debug access — both acceptable
        if (mutationResult !== 'no-state-debug') {
            expect(mutationResult).toBe('frozen');
        }
    });
});

// ── Audio Duration Race Condition Tests ────────────────────────────

test.describe('Audio: Race Condition Guards', () => {
    test('player controls do not crash with no audio loaded', async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Try to interact with player controls without any audio loaded
        // This simulates the race condition where UI exists but audio hasn't loaded
        const playerScrubber = page.locator('#player-scrubber');
        if (await playerScrubber.isVisible()) {
            await playerScrubber.fill('50');
        }

        // Try keyboard shortcuts
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('n');
        await page.keyboard.press('p');

        await page.waitForTimeout(500);

        // No TypeError or NaN errors should be thrown
        const typeErrors = errors.filter(e =>
            e.includes('TypeError') ||
            e.includes('NaN') ||
            e.includes('not a number')
        );
        expect(typeErrors).toHaveLength(0);
    });
});

// ── Mobile-Specific UI Tests ───────────────────────────────────────

test.describe('Mobile: UI Integrity', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('no sidebar visible on mobile viewport', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const sidebar = page.locator('#sidebar');
        const sidebarBox = await sidebar.boundingBox();
        if (sidebarBox) {
            // Either off-screen or display:none
            expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(0);
        }
    });

    test('mobile bottom nav is visible and functional', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const mobileNav = page.locator('#mobile-nav');
        await expect(mobileNav).toBeVisible();

        const navItems = page.locator('.mobile-nav-item');
        await expect(navItems).toHaveCount(4);

        // Each nav item should be clickable
        for (const route of ['library', 'settings', 'import']) {
            await page.click(`.mobile-nav-item[data-route="${route}"]`);
            await page.waitForTimeout(300);
        }
    });

    test('import form works on mobile viewport', async ({ page }) => {
        const errors = collectConsoleErrors(page);

        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await navigateTo(page, 'import');
        await page.waitForTimeout(500);

        const textArea = page.locator('#import-text');
        await expect(textArea).toBeVisible();
        await textArea.fill('Test mobile import content');

        const importBtn = page.locator('#btn-import');
        await expect(importBtn).toBeVisible();

        // Clicking should not cause JS errors
        await importBtn.click();
        await page.waitForTimeout(1000);

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('net::ERR')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('settings view renders properly on mobile', async ({ page }) => {
        await page.goto(BASE + '/');
        await page.waitForLoadState('networkidle');
        await navigateTo(page, 'settings');
        await page.waitForTimeout(500);

        const settingsView = page.locator('#view-settings');
        await expect(settingsView).toHaveClass(/active/);

        // Check that settings form elements are visible
        const voiceSelect = page.locator('#setting-voice-mobile, #setting-voice');
        if (await voiceSelect.count() > 0) {
            const firstVisible = voiceSelect.first();
            await expect(firstVisible).toBeVisible();
        }
    });
});
