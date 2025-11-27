import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { tabStore, TabNode } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import './tab-item';

@customElement('selected-pane')
export class SelectedPane extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
      background-color: var(--sl-color-neutral-50);
      padding: var(--sl-spacing-x-small);
    }

    .header {
      font-size: var(--sl-font-size-x-small);
      font-weight: bold;
      color: var(--sl-color-neutral-500);
      margin-bottom: var(--sl-spacing-x-small);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  `;



  render() {
    const selectedTabs = tabStore.sortedSelectedTabs.get();

    if (selectedTabs.length === 0) {
      return html``;
    }

    return html`
      <div class="header">
        <span>Selected (${selectedTabs.length})</span>
        <div>
          <sl-button size="small" variant="text" @click=${this.closeAllSelected}>Close All</sl-button>
          <sl-button size="small" variant="text" @click=${this.clearSelection}>Clear</sl-button>
        </div>
      </div>
      ${repeat(selectedTabs, (tab: TabNode) => tab.id, (tab: TabNode) => html`
        <tab-item
          .tab=${tab}
          @tab-select=${this.handleTabSelect}
          @tab-focus=${this.handleTabFocus}
          @tab-close=${this.handleTabClose}
        ></tab-item>
      `)}
    `;
  }

  private handleTabSelect(e: CustomEvent<{ id: number; selected: boolean }>) {
    // Deselecting from here
    tabStore.toggleSelection(e.detail.id, 'tab', e.detail.selected);
  }

  private handleTabClose(e: CustomEvent<{ id: number }>) {
    tabStore.closeTab(e.detail.id);
  }

  private handleTabFocus(e: CustomEvent<{ id: number }>) {
    e.stopPropagation();
    tabStore.focusTab(e.detail.id);
  }

  private async closeAllSelected() {
    const selectedTabs = tabStore.selectedTabs.get();
    const ids = selectedTabs.map(t => t.id);
    if (ids.length === 0) return;

    if (confirm(`Are you sure you want to close ${ids.length} tabs?`)) {
       await tabStore.closeTabs(ids);
       tabStore.setSelectedTabs(new Set());
    }
  }

  private clearSelection() {
    tabStore.setSelectedTabs(new Set());
  }
}
