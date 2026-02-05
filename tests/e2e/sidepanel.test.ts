import { test, expect } from './fixtures';

test.describe('Sidepanel Hierarchy View', () => {
  test('should open sidepanel and display windows and tabs', async ({ page, extensionId }) => {
    // Navigate to the sidepanel page
    // WXT sidepanel entrypoint is usually at /sidepanel.html
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Wait for the app root to be visible
    const appRoot = page.locator('app-root');
    await expect(appRoot).toBeVisible();

    // Check for window items
    const windowItems = page.locator('window-item');
    // At least one window should be visible (the one running the test)
    await expect(windowItems.first()).toBeVisible();

    // Check for tab items
    const tabItems = page.locator('tab-item');
    await expect(tabItems.first()).toBeVisible();
  });

  test('should toggle tab selection', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const firstTab = page.locator('tab-item').first();
    const checkbox = firstTab.locator('sl-checkbox');
    
    await expect(checkbox).toBeVisible();
    await checkbox.click();
    
    // Verify selection state (assuming sl-checkbox has checked attribute or similar)
    await expect(checkbox).toHaveAttribute('checked', '');
  });
});
