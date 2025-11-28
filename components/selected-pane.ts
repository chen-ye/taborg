import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { tabStore, TabNode } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import './tab-item';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import './group-tag';

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

    .header-actions {
      display: flex;
      gap: var(--sl-spacing-2x-small);
      align-items: center;
    }

    .group-dropdown {
      display: flex;
      align-items: center;
    }

    .group-trigger {
      cursor: pointer;
    }
  `;

  @state() private hasDropdownOpened = false;

  render() {
    const selectedTabs = tabStore.sortedSelectedTabs.get();

    if (selectedTabs.length === 0) {
      return html``;
    }

    return html`
      <div class="header">
        <span>Selected (${selectedTabs.length})</span>
        <div class="header-actions">
          <div class="group-dropdown">
            <sl-dropdown placement="bottom-end" hoist @sl-show=${this.handleDropdownShow}>
              <group-tag slot="trigger" size="small" pill class="group-trigger">
                <sl-icon name="folder"></sl-icon>
                <span style="margin-left: 4px">Group</span>
              </group-tag>
              <sl-menu @sl-select=${this.handleGroupSelect}>
                ${this.hasDropdownOpened ? repeat(
                  tabStore.getAllGroups(),
                  (group) => group.id,
                  (group) => {
                    const shoelaceColor = this.getShoelaceColor(group.color);
                    return html`
                      <sl-menu-item value="${group.title}">
                        <sl-icon slot="prefix" name="circle-fill" style="color: var(--sl-color-${shoelaceColor}-500)"></sl-icon>
                        ${group.title}
                      </sl-menu-item>
                    `;
                  }
                ) : ''}
              </sl-menu>
            </sl-dropdown>
          </div>
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

  private handleDropdownShow() {
    this.hasDropdownOpened = true;
  }

  private handleGroupSelect(e: CustomEvent) {
    const item = e.detail.item;
    const groupName = item.value;
    const selectedTabs = tabStore.sortedSelectedTabs.get();
    const ids = selectedTabs.map(t => t.id);
    if (ids.length > 0) {
      tabStore.moveTabsToGroup(ids, groupName);
    }
  }

  private getShoelaceColor(color: string) {
    return color === 'grey' ? 'neutral' : color;
  }
}
