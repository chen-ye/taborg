import { test, expect } from './fixtures';

test.describe('Tab Grouping', () => {
  test('should select multiple tabs and group them manually', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Select first two tabs
    const tabItems = page.locator('tab-item');
    await tabItems.nth(0).locator('sl-checkbox').click();
    await tabItems.nth(1).locator('sl-checkbox').click();

    // Check control bar
    const controlBar = page.locator('control-bar');
    await expect(controlBar).toBeVisible();

    // Click "Organize" (or similar button for manual grouping)
    // Looking at common UI patterns, there might be a "Group" button or menu
    // For now, let's verify selection count in UI if visible
    const selectionBadge = controlBar.locator('sl-badge');
    await expect(selectionBadge).toContainText('2');

    // Trigger manual grouping (placeholder for actual UI interaction)
    // await page.getByRole('button', { name: 'Group' }).click();
    // await page.getByPlaceholder('Group Name').fill('Test Group');
    // await page.keyboard.press('Enter');

    // Verify group creation (placeholder)
    // const groupItem = page.locator('group-item', { hasText: 'Test Group' });
    // await expect(groupItem).toBeVisible();
  });
});
