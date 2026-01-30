import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { type GroupNode, type TabNode, tabStore } from '../services/tabs/tab-store.js';
import './tab-item';
import './group-item';
import './window-item';
import type SlTree from '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree-item/tree-item.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import type SlDialog from '@shoelace-style/shoelace/dist/components/dialog/dialog.js';

@customElement('tab-tree')
export class TabTree extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
      padding: var(--sl-spacing-x-small);
    }

    sl-tree {
      --indent-size: var(--sl-spacing-medium);
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

    /* Drag and Drop styles */
    :host([dragging-type]) sl-tree-item[data-temp-expanded] sl-tree-item[data-type="tab"] {
      display: none;
    }

    /* :host([dragging-type="tab"]) sl-tree-item[data-type="tab"]:not([dragging]) {
      display: none;
    }

    :host([dragging-type="group"]) sl-tree-item[data-type="tab"] {
      display: none;
    }

    :host([dragging-type="window"]) sl-tree-item[data-type="tab"],
    :host([dragging-type="window"]) sl-tree-item[data-type="group"] {
      display: none;
    } */
  `;

  @state() private pendingMerge: { type: string; sourceId: number; targetId: number } | null = null;

  @property({ type: String, reflect: true, attribute: 'dragging-type' })
  draggingType: string | null = null;

  @property({ type: Number, reflect: true, attribute: 'dragging-id' })
  draggingId: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
  }

  render() {
    return html`
      <sl-tree
        selection="multiple"
        @sl-selection-change=${this.handleTreeSelectionChange}
        @merge-request=${this.handleMergeRequest}
      >
        ${repeat(
          tabStore.sortedWindows.get(),
          (window) => window.id,
          (window) => html`
          <sl-tree-item
            ?expanded=${this.draggingType ? true : !tabStore.collapsedWindowIds.has(window.id)}
            ?data-temp-expanded=${this.draggingType && tabStore.collapsedWindowIds.has(window.id)}
            data-id=${window.id}
            data-type="window"
            item-type="window"
            ?dragging=${this.draggingType === 'window' && this.draggingId === window.id}
            @sl-expand=${(evt: CustomEvent) => this.handleWindowExpand(evt, window.id)}
            @sl-collapse=${(evt: CustomEvent) => this.handleWindowCollapse(evt, window.id)}
          >
            <window-item .window=${window}></window-item>

            ${repeat(
              window.groups,
              (group: GroupNode) => group.id,
              (group: GroupNode) => html`
              <sl-tree-item
                ?expanded=${!group.collapsed}
                ?selected=${group.tabs.every((t: TabNode) => tabStore.selectedTabIds.has(t.id))}
                data-id=${group.id}
                data-type="group"
                ?dragging=${this.draggingType === 'group' && this.draggingId === group.id}
                @sl-expand=${(evt: CustomEvent) => this.handleGroupExpand(evt, group.id)}
                @sl-collapse=${(evt: CustomEvent) => this.handleGroupCollapse(evt, group.id)}
              >
                <group-item
                  .group=${group}
                  @group-rename=${this.handleGroupRename}
                  @group-close=${this.handleGroupClose}
                ></group-item>

                ${repeat(
                  group.tabs,
                  (tab: TabNode) => tab.id,
                  (tab: TabNode) => html`
                  <sl-tree-item
                    ?selected=${tabStore.selectedTabIds.has(tab.id)}
                    data-id=${tab.id}
                    data-type="tab"
                    ?dragging=${this.draggingType === 'tab' && this.draggingId === tab.id}
                  >
                    <tab-item
                      .tab=${tab}
                      @tab-focus=${this.handleTabFocus}
                      @tab-close=${this.handleTabClose}
                      @tab-move-to-group=${this.handleMoveToGroup}
                    ></tab-item>
                  </sl-tree-item>
                `,
                )}
              </sl-tree-item>
            `,
            )}

            ${repeat(
              window.tabs,
              (tab: TabNode) => tab.id,
              (tab: TabNode) => html`
              <sl-tree-item
                ?selected=${tabStore.selectedTabIds.has(tab.id)}
                data-id=${tab.id}
                data-type="tab"
                ?dragging=${this.draggingType === 'tab' && this.draggingId === tab.id}
              >
                <tab-item
                  .tab=${tab}
                  @tab-focus=${this.handleTabFocus}
                  @tab-close=${this.handleTabClose}
                  @tab-move-to-group=${this.handleMoveToGroup}
                ></tab-item>
              </sl-tree-item>
            `,
            )}
          </sl-tree-item>
        `,
        )}
      </sl-tree>

      <sl-dialog label="Confirm Merge" class="merge-dialog">
        ${
          this.pendingMerge
            ? html`
          Are you sure you want to merge these ${this.pendingMerge.type === 'merge-groups' ? 'groups' : 'windows'}?
        `
            : ''
        }
        <sl-button slot="footer" variant="primary" @click=${this.confirmMerge}>Merge</sl-button>
        <sl-button slot="footer" variant="default" @click=${this.cancelMerge}>Cancel</sl-button>
      </sl-dialog>
    `;
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);
    // Sync draggingType and draggingId properties with signal state
    const dragging = tabStore.draggingState.get();
    this.draggingType = dragging?.type || null;
    this.draggingId = dragging?.id ?? null;
  }

  updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    if (tabStore.followMode.get()) {
      const activeTabId = tabStore.activeTabId.get();
      if (activeTabId) {
        // Find the tree item for the active tab
        const treeItem = this.shadowRoot?.querySelector(`sl-tree-item[data-id="${activeTabId}"][data-type="tab"]`);
        if (treeItem) {
          treeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    }
  }

  private handleMergeRequest(e: CustomEvent) {
    e.stopPropagation();
    this.pendingMerge = e.detail;
    const dialog = this.shadowRoot?.querySelector('.merge-dialog') as SlDialog;
    dialog?.show();
  }

  private async confirmMerge() {
    const dialog = this.shadowRoot?.querySelector('.merge-dialog') as SlDialog;
    dialog?.hide();

    if (this.pendingMerge) {
      if (this.pendingMerge.type === 'merge-groups') {
        await tabStore.mergeGroups(this.pendingMerge.sourceId, this.pendingMerge.targetId);
      } else if (this.pendingMerge.type === 'merge-windows') {
        await tabStore.mergeWindows(this.pendingMerge.sourceId, this.pendingMerge.targetId);
      }
      this.pendingMerge = null;
    }
  }

  private cancelMerge() {
    const dialog = this.shadowRoot?.querySelector('.merge-dialog') as SlDialog;
    dialog?.hide();
    this.pendingMerge = null;
  }

  private handleTreeSelectionChange(e: CustomEvent) {
    const tree = e.target as SlTree;
    const selectedItems = tree.selectedItems;

    // Reset all selection first (or we could diff, but this is simpler for now)
    const newSelection = new Set<number>();
    selectedItems.forEach((item) => {
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
    if (this.draggingType) {
      return;
    }
    await tabStore.collapseGroup(groupId, false);
  }

  private async handleGroupCollapse(e: CustomEvent, groupId: number) {
    e.stopPropagation();
    if (this.draggingType) {
      return;
    }
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
      const g = w.groups.find((g: GroupNode) => g.title === groupName);
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
    this.dispatchEvent(
      new CustomEvent('selection-change', {
        detail: { count: tabStore.selectedTabIds.size },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleWindowExpand(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    if (this.draggingType) {
      return;
    }
    tabStore.setWindowCollapsed(windowId, false);
  }

  private handleWindowCollapse(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    if (this.draggingType) {
      return;
    }
    tabStore.setWindowCollapsed(windowId, true);
  }
}
