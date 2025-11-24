import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tabStore, WindowNode, GroupNode } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import { geminiService } from '../services/gemini.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

@customElement('control-bar')
export class ControlBar extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
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
      gap: var(--sl-spacing-x-small);
    }

    .right-actions {
      display: flex;
      gap: var(--sl-spacing-2x-small);
    }
  `;


  @state() private organizing = false;

  render() {
    const hasSelection = tabStore.selectedTabIds.size > 0;

    return html`
      <div class="bar">
        <div class="actions">
          <sl-button
            variant="primary"
            size="small"
            ?disabled=${this.organizing}
            @click=${this.handleOrganize}
          >
            ${this.organizing
              ? html`<sl-spinner style="font-size: 1rem; --track-width: 2px; margin-right: var(--sl-spacing-x-small);"></sl-spinner> Organizing...`
              : 'Organize Tabs'
            }
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
    try {
      // Collect all group names for context
      const allGroupNames = new Set<string>();
      tabStore.windows.forEach((w: WindowNode) => {
        w.groups.forEach((g: GroupNode) => {
          if (g.title) allGroupNames.add(g.title);
        });
      });
      // 2. Call Gemini
      const suggestions = await geminiService.categorizeTabs(
        tabsToOrganize.map(t => ({ id: t.id, title: t.title, url: t.url })),
        Array.from(allGroupNames)
      );

      // 3. Convert tab ID suggestions to URL suggestions
      const suggestionsByUrl = new Map<string, string[]>();
      for (const [tabId, groups] of suggestions.entries()) {
        const tab = tabsToOrganize.find(t => t.id === tabId);
        if (tab?.url) {
          suggestionsByUrl.set(tab.url, groups);
        }
      }

      tabStore.setSuggestions(suggestionsByUrl);

    } catch (e) {
      console.error(e);
      alert('Failed to organize tabs. Check your API key.');
    } finally {
      this.organizing = false;
    }
  }

  private handleSelectUngrouped() {
    tabStore.selectUngroupedTabs();
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
}
