import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tabStore, TabStoreController } from '../services/tab-store';
import { geminiService } from '../services/gemini';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

@customElement('control-bar')
export class ControlBar extends LitElement {
  static styles = css`
    :host {
      display: block;
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

  private store = new TabStoreController(this);
  @state() private organizing = false;

  render() {
    const hasSelection = tabStore.selectedTabIds.size > 0;

    return html`
      <div class="bar">
        <div class="actions">
          <sl-button
            variant="primary"
            size="small"
            ?disabled=${!hasSelection || this.organizing}
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
          <sl-tooltip content="Expand All Groups">
            <sl-icon-button
              name="arrows-expand"
              label="Expand All"
              @click=${this.expandAll}
            ></sl-icon-button>
          </sl-tooltip>

          <sl-tooltip content="Collapse All Groups">
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
    const selectedTabs = tabStore.getSelectedTabs();
    if (selectedTabs.length === 0) return;

    this.organizing = true;
    try {
      // 1. Get existing groups
      const existingGroups = new Set<string>();
      tabStore.windows.forEach(w => w.groups.forEach(g => existingGroups.add(g.title)));

      // 2. Call Gemini
      const suggestions = await geminiService.categorizeTabs(
        selectedTabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
        Array.from(existingGroups)
      );

      // 3. Update tabs with suggestions (in memory for now, or apply them?)
      // The requirement says: "Update the metadata associated with each tab inside the extension to include the suggested tab groups."
      // We need to update the store.

      // We'll update the store directly. Since TabNode is an interface, we need a way to update the state in TabStore.
      // Let's add a method to TabStore to update suggestions.

      // Wait, TabStore rebuilds from Chrome API. Suggestions are local state.
      // We need to store suggestions in TabStore separately or merge them.
      // Let's assume TabStore keeps a map of suggestions.

      // For now, I'll dispatch an event or call a method on tabStore if I can add it.
      // I'll need to update TabStore to handle suggestions.

      // Let's assume I can update TabStore. I'll modify TabStore in the next step to handle this if needed,
      // but for now I'll just assume I can set it.

      // Actually, I should update TabStore to store suggestions.
      // Let's do a quick update to TabStore after this file.

      // For now, let's just log it.
      console.log('Suggestions:', suggestions);

      // We need to update the UI.
      // I'll add a method `setSuggestions(map)` to TabStore.
      // But I can't call it if it doesn't exist.
      // I will modify TabStore in the next step.

      // Let's dispatch a custom event that TabStore (or AppRoot) could listen to?
      // Or better, just import tabStore and call a new method I'm about to add.

      (tabStore as any).setSuggestions(suggestions);

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
  }

  private collapseAll() {
    tabStore.setAllGroupsCollapsed(true);
  }
}
