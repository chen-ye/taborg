import { expect, test } from './fixtures';

test.describe('Tab Grouping and AI Suggestions', () => {
  test('should trigger autosuggest and apply a suggestion', async ({ page, context, extensionId }) => {
    // 0. Open a tab that matches the AI mock
    const googleTab = await context.newPage();
    await googleTab.goto('https://google.com');
    await googleTab.waitForLoadState('networkidle');

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // 1. Trigger Autosuggest
    const autosuggestButton = page.getByRole('button', { name: 'Autosuggest' });
    await expect(autosuggestButton).toBeVisible();
    await autosuggestButton.click();

    // 2. Wait for suggestions to appear on the Google tab
    const googleTabItem = page.locator('tab-item', { hasText: 'Google' });
    const suggestionTag = googleTabItem.locator('.suggestions group-tag', { hasText: 'Search' });
    await expect(suggestionTag).toBeVisible({ timeout: 10000 });

    const groupName = await suggestionTag.textContent();
    expect(groupName?.trim()).toBe('Search');

    // 3. Apply the suggestion
    await suggestionTag.click();

    // 4. Verify the tab is now in a group
    // In the tree, grouped tabs are children of a group-item
    const groupItem = page.locator('group-item', { hasText: groupName?.trim() });
    await expect(groupItem).toBeVisible();
  });
});
