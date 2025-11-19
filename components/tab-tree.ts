
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { TabStoreController, tabStore, WindowNode } from '../services/tab-store';
import './tab-item';
import './group-item';
import './window-item';
import type SlTree from '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree-item/tree-item.js';

@customElement('tab-tree')
export class TabTree extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: var(--sl-spacing-x-small);
    }

    sl-tree {
      --indent-size: var(--sl-spacing-large);
    }

    /* Remove default padding/background from tree items to fit our custom components */
    sl-tree-item::part(label) {
      padding: 0;
    }

    /* Remove default padding/background from tree items to fit our custom components */
    sl-tree-item::part(label) {
      padding: 0;
    }

    sl-tree-item {
        &::part(label) {
          min-width: 0;
          flex-grow: 1;
          justify-content: space-between;
          gap: var(--sl-spacing-x-small);
          align-self: stretch;
          align-items: stretch;
        }

        &::part(children)::before {
          left: calc(
            1em - var(--indent-size) + (var(--icon-size) / 2) +
              var(--icon-padding) + 3px - (var(--indent-guide-width) / 2) - 1px
          );
        }
      }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.init();
  }

  async init() {
    this.currentWindowId = (await chrome.windows.getCurrent()).id;
    await this.loadCollapsedWindows();
  }

  private async loadCollapsedWindows() {
    const result = await chrome.storage.local.get('collapsed-windows');
    const collapsed = (result['collapsed-windows'] as number[]) || [];
    this.collapsedWindows = new Set(collapsed);
  }

  private async saveCollapsedWindows() {
    await chrome.storage.local.set({ 'collapsed-windows': Array.from(this.collapsedWindows) });
  }

  private store = new TabStoreController(this);

  @property({type: Number})
  currentWindowId: number | undefined;

  @state()
  collapsedWindows: Set<number> = new Set();

  @state()
  private sortedWindows: WindowNode[] = [];

  willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    // Recalculate sorted windows on every update since TabStoreController
    // triggers renders when the store changes, and we need fresh sorting
    this.sortedWindows = [...tabStore.windows].sort((a, b) => {
      if (a.id === this.currentWindowId) return -1;
      if (b.id === this.currentWindowId) return 1;
      return a.id - b.id;
    });
  }

  render() {
    return html`
      <sl-tree selection="multiple" @sl-selection-change=${this.handleTreeSelectionChange}>
        ${repeat(this.sortedWindows, (window) => window.id, (window) => html`
          <sl-tree-item
            ?expanded=${!this.collapsedWindows.has(window.id)}
            @sl-expand=${(evt) => this.handleWindowExpand(evt, window.id)}
            @sl-collapse=${(evt) => this.handleWindowCollapse(evt, window.id)}
          >
            <window-item .window=${window}></window-item>

            ${repeat(window.groups, (group) => group.id, (group) => html`
              <sl-tree-item
                ?expanded=${!group.collapsed}
                ?selected=${group.selected}
                @sl-expand=${(evt) => this.handleGroupExpand(evt, group.id)}
                @sl-collapse=${(evt) => this.handleGroupCollapse(evt, group.id)}
                data-id=${group.id}
                data-type="group"
              >
                <group-item
                  .group=${group}
                  @group-rename=${this.handleGroupRename}
                  @group-close=${this.handleGroupClose}
                ></group-item>

                ${repeat(group.tabs, (tab) => tab.id, (tab) => html`
                  <sl-tree-item
                    ?selected=${tab.selected}
                    data-id=${tab.id}
                    data-type="tab"
                  >
                    <tab-item
                      .tab=${tab}
                      @tab-focus=${this.handleTabFocus}
                      @tab-close=${this.handleTabClose}
                      @tab-move-to-group=${this.handleMoveToGroup}
                    ></tab-item>
                  </sl-tree-item>
                `)}
              </sl-tree-item>
            `)}

            ${repeat(window.tabs, (tab) => tab.id, (tab) => html`
              <sl-tree-item
                ?selected=${tab.selected}
                data-id=${tab.id}
                data-type="tab"
              >
                <tab-item
                  .tab=${tab}
                  @tab-focus=${this.handleTabFocus}
                  @tab-close=${this.handleTabClose}
                  @tab-move-to-group=${this.handleMoveToGroup}
                ></tab-item>
              </sl-tree-item>
            `)}
          </sl-tree-item>
        `)}
      </sl-tree>
    `;
  }

  private handleTreeSelectionChange(e: CustomEvent) {
    const tree = e.target as SlTree;
    const selectedItems = tree.selectedItems;

    // Reset all selection first (or we could diff, but this is simpler for now)
    const newSelection = new Set<number>();
    selectedItems.forEach(item => {
      const id = Number(item.getAttribute('data-id'));
      const type = item.getAttribute('data-type');

      if (type === 'tab') {
        newSelection.add(id);
      }
    });

    tabStore.setSelectedTabs(newSelection);

    this.emitSelectionChange();
  }

  private handleTabFocus(e: CustomEvent) {
    e.stopPropagation();
    tabStore.focusTab(e.detail.id);
  }

  private handleTabClose(e: CustomEvent) {
    e.stopPropagation();
    tabStore.closeTab(e.detail.id);
  }

  private handleGroupClose(e: CustomEvent) {
    e.stopPropagation();
    tabStore.closeGroup(e.detail.id);
  }

  private async handleGroupExpand(e: CustomEvent, groupId: number) {
    e.stopPropagation();
    await tabStore.collapseGroup(groupId, false);
  }

  private async handleGroupCollapse(e: CustomEvent, groupId: number) {
    e.stopPropagation();
    await tabStore.collapseGroup(groupId, true);
  }

  private handleGroupRename(e: CustomEvent) {
    e.stopPropagation();
    tabStore.renameGroup(e.detail.id, e.detail.title);
  }

  private async handleMoveToGroup(e: CustomEvent) {
    e.stopPropagation();
    const { tabId, groupName } = e.detail;
    // Find existing group with name
    let targetGroupId: number | undefined;

    // Simple search for existing group
    for (const w of tabStore.windows) {
      const g = w.groups.find(g => g.title === groupName);
      if (g) {
        targetGroupId = g.id;
        break;
      }
    }

    if (targetGroupId) {
      await tabStore.moveTabToGroup(tabId, targetGroupId);
    } else {
      await tabStore.createGroupForTab(tabId, groupName);
    }

    await tabStore.clearSuggestions(tabId);
  }

  private emitSelectionChange() {
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { count: tabStore.selectedTabIds.size },
      bubbles: true,
      composed: true
    }));
  }

  private handleWindowExpand(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    this.collapsedWindows.delete(windowId);
    this.saveCollapsedWindows();
  }

  private handleWindowCollapse(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    this.collapsedWindows.add(windowId);
    this.saveCollapsedWindows();
  }
}
