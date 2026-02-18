// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',
    
    /* Run tests in files in parallel */
    fullyParallel: true,
    
    /* Fail the build on CI if you accidentally left test.only in the source code */
    forbidOnly: !!process.env.CI,
    
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    
    /* Opt out of parallel tests on CI */
    workers: process.env.CI ? 1 : undefined,
    
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'playwright-report/report.json' }],
        ['list']
    ],
    
    /* Shared settings for all the projects below */
    use: {
        /* Base URL to use in actions like `await page.goto('/')` */
        baseURL: 'http://localhost:49112',
        
        /* Collect trace when retrying the failed test */
        trace: 'on-first-retry',
        
        /* Screenshot on failure */
        screenshot: 'only-on-failure',
    },
    
    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    
    /* Output directory for test artifacts */
    outputDir: 'test-results/',
});
