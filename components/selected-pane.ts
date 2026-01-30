import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { type TabNode, tabStore } from '../services/tabs/tab-store.js';
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
      ${repeat(
        selectedTabs,
        (tab: TabNode) => tab.id,
        (tab: TabNode) => html`
        <tab-item
          .tab=${tab}
          @tab-select=${this.handleTabSelect}
          @tab-focus=${this.handleTabFocus}
          @tab-close=${this.handleTabClose}
        ></tab-item>
      `,
      )}
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
}
