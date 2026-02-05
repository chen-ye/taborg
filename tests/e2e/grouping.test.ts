import { expect, test } from './fixtures';

test.describe('Tab Grouping and AI Suggestions', () => {
  test('should trigger autosuggest and apply a suggestion', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // 1. Trigger Autosuggest
    const autosuggestButton = page.getByRole('button', { name: 'Autosuggest' });
    await expect(autosuggestButton).toBeVisible();
    await autosuggestButton.click();

    // 2. Wait for suggestions to appear on a tab-item
    // Since we are using mocks in unit tests, in E2E we rely on the built-in AI
    // or the configured API key. In a test environment, we might need to mock
    // the LLM response if we want a deterministic E2E test,
    // but for now let's check for the "processing" state or the appearance of tags.

    const firstTab = page.locator('tab-item').first();

    // Check if it enters processing state (shimmer animation)
    // await expect(firstTab.locator('.tab-row')).toHaveClass(/processing/);

    // Wait for a suggestion tag to appear (group-tag inside .suggestions)
    const suggestionTag = firstTab.locator('.suggestions group-tag', { hasText: 'Search' });
    // Increase timeout as AI can be slow (even mock needs time to trigger)
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
