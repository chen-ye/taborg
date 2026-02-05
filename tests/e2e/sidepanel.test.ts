import { expect, test } from './fixtures';

test.describe('Sidepanel Hierarchy View', () => {
  test('should open sidepanel and display windows and tabs', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Wait for the app root
    await expect(page.locator('app-root')).toBeVisible();

    // Check for window items
    await expect(page.locator('window-item').first()).toBeVisible();

    // Check for tab items
    await expect(page.locator('tab-item').first()).toBeVisible();
  });

  test('should toggle tab selection and show in Selected pane', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const firstTab = page.locator('tab-item').first();
    const tabTitle = await firstTab.locator('.title').textContent();
    const checkbox = firstTab.locator('sl-checkbox');

    await checkbox.click();

    // Open the "Selected" pane at the bottom
    const selectedDetails = page.locator('sl-details', { hasText: 'Selected' });
    await selectedDetails.click();

    // Verify the tab appears in the selected pane
    const selectedPane = page.locator('selected-pane');
    await expect(selectedPane.locator('tab-item', { hasText: tabTitle?.trim() || '' })).toBeVisible();
  });
});
