const { test, expect } = require('@playwright/test');

const URL = 'https://zemskekure.github.io/sketchup-prompt-builder/';
const PWD = 'kolokolo';

// Helper: login
async function login(page) {
  await page.goto(URL);
  await page.waitForSelector('#lock', { state: 'visible' });
  await page.fill('#pwdIn', PWD);
  await page.click('.lk-btn');
  await page.waitForSelector('#app', { state: 'visible' });
}

test.describe('Lock Screen', () => {
  test('shows lock screen on load', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('.lk-logo-text')).toHaveText('marinada');
    await expect(page.locator('#pwdIn')).toBeVisible();
    await expect(page.locator('.lk-btn')).toBeVisible();
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto(URL);
    await page.fill('#pwdIn', 'wrongpassword');
    await page.click('.lk-btn');
    await page.waitForTimeout(500);
    await expect(page.locator('.lk-err')).toHaveText('Špatné heslo');
  });

  test('correct password unlocks app', async ({ page }) => {
    await login(page);
    await expect(page.locator('#lock')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();
  });

  test('Enter key submits password', async ({ page }) => {
    await page.goto(URL);
    await page.fill('#pwdIn', PWD);
    await page.press('#pwdIn', 'Enter');
    await page.waitForSelector('#app', { state: 'visible' });
    await expect(page.locator('#app')).toBeVisible();
  });

  test('auto-login works on second visit', async ({ page }) => {
    await login(page);
    // Reload — should auto-unlock from localStorage
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.locator('#app')).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('header shows marinada logo and nav', async ({ page }) => {
    await expect(page.locator('.hdr-name')).toHaveText('marinada');
    await expect(page.locator('nav a[data-nav="studio"]')).toBeVisible();
    await expect(page.locator('nav a[data-nav="spend"]')).toBeVisible();
    await expect(page.locator('nav a[data-nav="master"]')).toBeVisible();
  });

  test('Projekty view loads with cards', async ({ page }) => {
    await expect(page.locator('#v-sessions')).toBeVisible();
    await expect(page.locator('.sec-title')).toHaveText('Projekty');
    // Should have at least the "+ Nový projekt" card
    await page.waitForSelector('.card-new', { timeout: 5000 });
    await expect(page.locator('.card-new')).toBeVisible();
  });

  test('Výdaje tab opens', async ({ page }) => {
    await page.click('nav a[data-nav="spend"]');
    await expect(page.locator('#v-spend')).toBeVisible();
    await expect(page.locator('#v-spend .sec-title')).toHaveText('Výdaje');
    // Stats cards should be visible
    await expect(page.locator('#spN')).toBeVisible();
    await expect(page.locator('#spU')).toBeVisible();
    await expect(page.locator('#spK')).toBeVisible();
  });

  test('Master Marinada tab opens', async ({ page }) => {
    await page.click('nav a[data-nav="master"]');
    await expect(page.locator('#v-master')).toBeVisible();
    await expect(page.locator('#v-master .sec-title')).toHaveText('Master Marinada');
    // Two pick areas should be visible
    await expect(page.locator('#masterLeftPick')).toBeVisible();
    await expect(page.locator('#masterRightPick')).toBeVisible();
  });

  test('clicking marinada logo returns to Projekty', async ({ page }) => {
    await page.click('nav a[data-nav="spend"]');
    await expect(page.locator('#v-spend')).toBeVisible();
    await page.click('.hdr-left');
    await expect(page.locator('#v-sessions')).toBeVisible();
  });
});

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('create new project', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept('Test Projekt E2E');
    });
    await page.click('.card-new');
    // Should navigate to session detail
    await page.waitForSelector('#v-session', { state: 'visible', timeout: 5000 });
    await expect(page.locator('#sessionTitle')).toHaveText('Test Projekt E2E');
  });

  test('session detail shows scene cards and style ref', async ({ page }) => {
    // First create a session
    page.on('dialog', async dialog => {
      await dialog.accept('UX Test Session');
    });
    await page.click('.card-new');
    await page.waitForSelector('#v-session', { state: 'visible', timeout: 5000 });
    // Should show style ref box
    await expect(page.locator('#styleRefBox')).toBeVisible();
    // Should show + Nová scéna card
    await expect(page.locator('#sceneCards .card-new')).toBeVisible();
  });

  test('breadcrumb navigation works', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept('Breadcrumb Test');
    });
    await page.click('.card-new');
    await page.waitForSelector('#v-session', { state: 'visible', timeout: 5000 });
    // Breadcrumb should show Projekty > Breadcrumb Test
    await expect(page.locator('#crumb')).toContainText('Projekty');
    await expect(page.locator('#crumb')).toContainText('Breadcrumb Test');
    // Click Projekty in breadcrumb
    await page.locator('#crumb span').first().click();
    await expect(page.locator('#v-sessions')).toBeVisible();
  });
});

test.describe('Scene Studio', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Create a session and a scene
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      if (dialogCount === 1) await dialog.accept('Studio Test');
      else await dialog.accept('Test Scéna');
    });
    await page.click('.card-new');
    await page.waitForSelector('#v-session', { state: 'visible', timeout: 5000 });
    await page.click('#sceneCards .card-new');
    await page.waitForSelector('#v-scene', { state: 'visible', timeout: 5000 });
  });

  test('scene opens at step 1 (Upload)', async ({ page }) => {
    await expect(page.locator('#sceneTitle')).toHaveText('Test Scéna');
    await expect(page.locator('#sc-upload')).toBeVisible();
    // Upload zone should be visible
    await expect(page.locator('#uploadZone')).toBeVisible();
    // Button should be disabled (no image)
    await expect(page.locator('#toAnalyzeBtn')).toBeDisabled();
  });

  test('step bar shows all 6 steps', async ({ page }) => {
    const steps = page.locator('.step');
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(0)).toContainText('Obrázek');
    await expect(steps.nth(1)).toContainText('Analýza');
    await expect(steps.nth(2)).toContainText('Nastavení');
    await expect(steps.nth(3)).toContainText('Render');
    await expect(steps.nth(4)).toContainText('Iterace');
    await expect(steps.nth(5)).toContainText('Export');
  });

  test('steps 4-6 are not clickable without renders', async ({ page }) => {
    // Steps 4-6 should have opacity:0.4 (greyed out)
    const step5 = page.locator('.step').nth(4);
    const opacity = await step5.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });
});

test.describe('Settings Step', () => {
  test('settings UI elements render correctly', async ({ page }) => {
    await login(page);
    // Navigate to any existing session/scene or create one
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      await dialog.accept(dialogCount === 1 ? 'Settings Test' : 'Scéna 1');
    });
    await page.click('.card-new');
    await page.waitForSelector('#v-session', { state: 'visible', timeout: 5000 });
    await page.click('#sceneCards .card-new');
    await page.waitForSelector('#v-scene', { state: 'visible', timeout: 5000 });
    // Jump to step 3
    await page.locator('.step').nth(2).click();
    await page.waitForSelector('#sc-settings', { state: 'visible' });

    // Check all pill groups exist
    await expect(page.locator('#sceneType')).toBeVisible();
    await expect(page.locator('#timeOfDay')).toBeVisible();
    await expect(page.locator('#weather')).toBeVisible();
    await expect(page.locator('#floorLevel')).toBeVisible();
    await expect(page.locator('#aspectRatio')).toBeVisible();

    // Check sliders exist
    await expect(page.locator('#matS')).toBeVisible();
    await expect(page.locator('#angS')).toBeVisible();
    await expect(page.locator('#vegS')).toBeVisible();
    await expect(page.locator('#pplS')).toBeVisible();

    // Check preset bar exists
    await expect(page.locator('#presetBar')).toBeVisible();

    // Test pill toggle
    await page.locator('#sceneType .pill[data-val="interior"]').click();
    await expect(page.locator('#sceneType .pill[data-val="interior"]')).toHaveClass(/on/);
    await expect(page.locator('#sceneType .pill[data-val="exterior"]')).not.toHaveClass(/on/);
  });
});

test.describe('Logout', () => {
  test('logout returns to lock screen', async ({ page }) => {
    await login(page);
    await expect(page.locator('#app')).toBeVisible();
    // Find and click logout
    await page.locator('a:has-text("Odhlásit")').click();
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  });

  test('after logout, password field is empty', async ({ page }) => {
    await login(page);
    await page.locator('a:has-text("Odhlásit")').click();
    await expect(page.locator('#pwdIn')).toHaveValue('');
  });
});

test.describe('Cleanup', () => {
  test('delete test sessions', async ({ page }) => {
    await login(page);
    // Wait for sessions to load
    await page.waitForTimeout(2000);
    // Delete any test sessions we created
    const cards = page.locator('.card-actions');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = page.locator('.card-body .card-name').nth(0);
      const name = await card.textContent();
      if (name && (name.includes('Test') || name.includes('E2E') || name.includes('UX') || name.includes('Breadcrumb') || name.includes('Studio') || name.includes('Settings'))) {
        page.on('dialog', async dialog => { await dialog.accept(); });
        await page.locator('.card-actions').nth(0).locator('button:has-text("Smazat")').click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
