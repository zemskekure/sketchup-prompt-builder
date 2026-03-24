const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'https://zemskekure.github.io/sketchup-prompt-builder/',
    screenshot: 'on',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [['list'], ['html', { open: 'never' }]],
});
