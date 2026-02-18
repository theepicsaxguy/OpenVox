// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Podcast Studio Frontend', () => {
    test.beforeEach(async ({ page }) => {
        // Capture console logs and errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error(`Browser console error: ${msg.text()}`);
            }
        });
        page.on('pageerror', error => {
            console.error(`Browser page error: ${error.message}`);
        });
    });

    test('homepage loads without JavaScript errors', async ({ page }) => {
        // Navigate to the homepage
        await page.goto('http://localhost:49112/');
        
        // Wait for the page to be fully loaded
        await page.waitForLoadState('networkidle');
        
        // Wait a bit for any async scripts to execute
        await page.waitForTimeout(1000);
        
        // Check that the main app shell is present
        await expect(page.locator('.app-shell')).toBeVisible();
        
        // Check that no console errors occurred
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        
        // Allow time for any errors to be captured
        await page.waitForTimeout(500);
        
        expect(errors).toHaveLength(0);
    });

    test('API endpoints are accessible', async ({ page }) => {
        // Test health endpoint
        const healthResponse = await page.request.get('http://localhost:49112/health');
        expect(healthResponse.status()).toBe(200);
        
        const healthData = await healthResponse.json();
        expect(healthData.status).toBe('healthy');
        
        // Test voices endpoint
        const voicesResponse = await page.request.get('http://localhost:49112/v1/voices');
        expect(voicesResponse.status()).toBe(200);
        
        const voicesData = await voicesResponse.json();
        expect(voicesData.data).toBeDefined();
        expect(voicesData.data.length).toBeGreaterThan(0);
    });

    test('Studio API endpoints are accessible', async ({ page }) => {
        // Test library tree endpoint
        const treeResponse = await page.request.get('http://localhost:49112/api/studio/library/tree');
        expect(treeResponse.status()).toBe(200);
        
        // Test settings endpoint
        const settingsResponse = await page.request.get('http://localhost:49112/api/studio/settings');
        expect(settingsResponse.status()).toBe(200);
    });

    test('navigation works without JS errors', async ({ page }) => {
        await page.goto('http://localhost:49112/');
        await page.waitForLoadState('networkidle');
        
        // Try to click on hamburger menu
        const hamburger = page.locator('#btn-hamburger');
        if (await hamburger.isVisible()) {
            await hamburger.click();
            await page.waitForTimeout(300);
        }
        
        // Check no errors occurred
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        
        await page.waitForTimeout(500);
        expect(errors).toHaveLength(0);
    });
});
