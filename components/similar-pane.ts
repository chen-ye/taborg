import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { tabStore, TabNode } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import './tab-item';

@customElement('similar-pane')
export class SimilarPane extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
      background-color: var(--sl-color-neutral-50);
      padding: var(--sl-spacing-x-small);
    }
  `;

  render() {
    const similarTabs = tabStore.similarTabs.get();

    if (similarTabs.length === 0) {
      return html`<div style="padding: var(--sl-spacing-medium); text-align: center; color: var(--sl-color-neutral-500);">No similar tabs found</div>`;
    }

    return html`
      ${repeat(similarTabs, (tab: TabNode) => tab.id, (tab: TabNode) => html`
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
