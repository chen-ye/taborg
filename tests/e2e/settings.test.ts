import { expect, test } from './fixtures';

test.describe('Settings Dialog', () => {
  test('should open settings and allow configuring Gemini and OpenAI', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Click settings button in control bar
    const settingsButton = page.locator('sl-icon-button[label="Settings"]');
    await settingsButton.click();

    // Verify dialog is open
    const dialog = page.locator('sl-dialog[label="Settings"]');
    await expect(dialog).toBeVisible();

    // Check for new fields
    await expect(page.locator('#gemini-model-input')).toBeVisible();
    await expect(page.locator('#openai-url-input')).toBeVisible();
    await expect(page.locator('#openai-key-input')).toBeVisible();
    await expect(page.locator('#openai-model-input')).toBeVisible();

    // Test entering a value and blurring (which triggers save)
    const modelInput = page.locator('#gemini-model-input');
    await modelInput.locator('input').fill('gemini-ultra');
    await modelInput.locator('input').blur();

    // Verify status icon appears (saved)
    await expect(page.locator('sl-icon[name="check-circle"]')).toBeVisible();
  });
});
