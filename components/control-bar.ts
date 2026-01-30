import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { llmManager } from '../services/ai/llm-manager.js';
import { type GroupNode, tabStore, type WindowNode } from '../services/tabs/tab-store.js';
import { toast } from '../utils/toast.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

@customElement('control-bar')
export class ControlBar extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--sl-spacing-x-small);
      padding: var(--sl-spacing-x-small) var(--sl-spacing-medium);
      border-top: var(--sl-border-width) solid var(--sl-color-neutral-200);
      background-color: var(--sl-color-neutral-0);
    }

    .bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sl-spacing-x-small);
    }

    .right-actions {
      display: flex;
      gap: var(--sl-spacing-2x-small);
    }

    sl-icon-button[variant="primary"]::part(base) {
      color: var(--sl-color-primary-600);
    }
  `;

  @state() private organizing = false;
  @state() private findingSimilar = false;

  render() {
    const hasSelection = tabStore.selectedTabIds.size > 0;
    const singleSelection = tabStore.selectedTabIds.size === 1;

    return html`
      <div class="bar">
        <div class="actions">
          <sl-button
            variant="primary"
            size="small"
            ?disabled=${this.organizing}
            @click=${this.handleOrganize}
            ?loading=${this.organizing}
          >Autosuggest</sl-button>

          <sl-button
            variant="default"
            size="small"
            ?disabled=${!singleSelection || this.findingSimilar}
            @click=${this.handleSelectSimilar}
            ?loading=${this.findingSimilar}
          >
            Select Similar
          </sl-button>

          <sl-button
            variant="default"
            size="small"
            @click=${this.handleSelectDuplicates}
          >
            Select Dupes
          </sl-button>

          <sl-button
            variant="default"
            size="small"
            @click=${this.handleSelectUngrouped}
          >
            Select Ungrouped
          </sl-button>

          <sl-button
            variant="default"
            size="small"
            ?disabled=${!hasSelection}
            @click=${this.handleDeselectAll}
          >
            Deselect All
          </sl-button>
        </div>

        </div>

        <div class="right-actions">
          <sl-dropdown placement="bottom-end" hoist>
            <sl-icon-button slot="trigger" name="eye" label="View Settings"></sl-icon-button>
            <sl-menu>
              <sl-menu-item
                type="checkbox"
                ?checked=${tabStore.viewOptions.get().viewMode === 'compact'}
                @click=${() => this.setViewMode('compact')}
              >Compact</sl-menu-item>
              <sl-menu-item
                type="checkbox"
                ?checked=${tabStore.viewOptions.get().viewMode === 'detailed'}
                @click=${() => this.setViewMode('detailed')}
              >Detailed</sl-menu-item>
            </sl-menu>
          </sl-dropdown>

          <sl-tooltip content="Follow Me">
            <sl-icon-button
              name="crosshair"
              label="Follow Me Mode"
              variant=${tabStore.followMode.get() ? 'primary' : 'default'}
              @click=${this.toggleFollowMode}
            ></sl-icon-button>
          </sl-tooltip>

          <sl-tooltip content="Expand All">
            <sl-icon-button
              name="arrows-expand"
              label="Expand All"
              @click=${this.expandAll}
            ></sl-icon-button>
          </sl-tooltip>

          <sl-tooltip content="Collapse All">
            <sl-icon-button
              name="arrows-collapse"
              label="Collapse All"
              @click=${this.collapseAll}
            ></sl-icon-button>
          </sl-tooltip>

          <sl-tooltip content="Settings">
            <sl-icon-button
              name="gear"
              label="Settings"
              @click=${this.openSettings}
            ></sl-icon-button>
          </sl-tooltip>
        </div>
      </div>
    `;
  }

  private openSettings() {
    window.dispatchEvent(new CustomEvent('open-settings'));
  }

  private async handleOrganize() {
    let tabsToOrganize = tabStore.getSelectedTabs();
    if (tabsToOrganize.length === 0) {
      tabsToOrganize = tabStore.getTabsWithoutSuggestions();
    }

    if (tabsToOrganize.length === 0) return;

    this.organizing = true;

    // Set processing state for all tabs
    tabStore.setProcessing(
      tabsToOrganize.map((t) => t.id),
      true,
    );

    try {
      // Collect all group names for context
      const allGroupNames = new Set<string>();
      tabStore.windows.forEach((w: WindowNode) => {
        w.groups.forEach((g: GroupNode) => {
          if (g.title) allGroupNames.add(g.title);
        });
      });

      // 2. Call LLM Manager with incremental callback
      await llmManager.categorizeTabs(
        tabsToOrganize.map((t) => ({ id: t.id, title: t.title, url: t.url })),
        Array.from(allGroupNames),
        (batchResults: Map<number, string[]>) => {
          // Process incremental results
          const suggestionsByUrl = new Map<string, string[]>();
          const processedIds: number[] = [];

          for (const [tabId, groups] of batchResults.entries()) {
            const tab = tabsToOrganize.find((t) => t.id === tabId);
            if (tab?.url) {
              suggestionsByUrl.set(tab.url, groups);
            }
            processedIds.push(tabId);
          }

          // Update store incrementally
          tabStore.updateSuggestions(suggestionsByUrl);
          // Clear processing state for finished tabs
          tabStore.setProcessing(processedIds, false);
        },
      );

      // Final cleanup usually handled by onProgress, but safe to ensure clear here if needed
      // (Depends on if verify all are done. safely clear all specific IDs)
      tabStore.setProcessing(
        tabsToOrganize.map((t) => t.id),
        false,
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to organize tabs. Check your API key or AI settings.');
      // Clear processing on error
      tabStore.setProcessing(
        tabsToOrganize.map((t) => t.id),
        false,
      );
    } finally {
      this.organizing = false;
    }
  }

  private async handleSelectSimilar() {
    const selectedTabs = tabStore.getSelectedTabs();
    if (selectedTabs.length !== 1) return;

    const referenceTab = selectedTabs[0];
    this.findingSimilar = true;

    try {
      // Get all other tabs
      const allTabs: { id: number; title: string; url: string }[] = [];
      tabStore.windows.forEach((w) => {
        w.tabs.forEach((t) => {
          if (t.id !== referenceTab.id) allTabs.push({ id: t.id, title: t.title, url: t.url });
        });
        w.groups.forEach((g) => {
          g.tabs.forEach((t) => {
            if (t.id !== referenceTab.id) allTabs.push({ id: t.id, title: t.title, url: t.url });
          });
        });
      });

      const similarTabIds = await llmManager.findSimilarTabs(
        { id: referenceTab.id, title: referenceTab.title, url: referenceTab.url },
        allTabs,
      );

      // Select the found tabs (keeping the reference tab selected)
      const newSelection = new Set(tabStore.selectedTabIds);
      for (const id of similarTabIds) {
        newSelection.add(id);
      }
      tabStore.setSelectedTabs(newSelection);

      toast.success(`Found ${similarTabIds.length} similar tabs.`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to find similar tabs. Check your API key.');
    } finally {
      this.findingSimilar = false;
    }
  }

  private handleSelectUngrouped() {
    tabStore.selectUngroupedTabs();
  }

  private handleSelectDuplicates() {
    tabStore.selectDuplicateTabs();
    toast.success('Duplicate tabs selected.');
  }

  private handleDeselectAll() {
    tabStore.setSelectedTabs(new Set());
  }

  private expandAll() {
    tabStore.setAllGroupsCollapsed(false);
    // Expand all windows
    for (const w of tabStore.windows) {
      tabStore.setWindowCollapsed(w.id, false);
    }
  }

  private async collapseAll() {
    const currentWindowId = tabStore.currentWindowId.get();

    // Find the current active tab and its group
    let currentGroupId: number | undefined;
    for (const w of tabStore.windows) {
      if (w.id === currentWindowId) {
        // Find active tab in current window
        for (const tab of w.tabs) {
          if (tab.active && tab.groupId > -1) {
            currentGroupId = tab.groupId;
            break;
          }
        }
        for (const group of w.groups) {
          for (const tab of group.tabs) {
            if (tab.active) {
              currentGroupId = group.id;
              break;
            }
          }
          if (currentGroupId) break;
        }
        break;
      }
    }

    // Collapse all groups except current group
    for (const w of tabStore.windows) {
      for (const g of w.groups) {
        if (g.id !== currentGroupId) {
          await chrome.tabGroups.update(g.id, { collapsed: true });
        }
      }
    }

    // Collapse all windows except current window
    for (const w of tabStore.windows) {
      if (w.id !== currentWindowId) {
        tabStore.setWindowCollapsed(w.id, true);
      }
    }
  }
  private toggleFollowMode() {
    tabStore.toggleFollowMode();
  }

  private setViewMode(mode: 'compact' | 'detailed') {
    tabStore.setViewMode(mode);
  }
}
