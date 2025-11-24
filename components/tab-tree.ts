import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { tabStore, WindowNode, GroupNode, TabNode } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import './tab-item';
import './group-item';
import './window-item';
import type SlTree from '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree/tree.js';
import '@shoelace-style/shoelace/dist/components/tree-item/tree-item.js';

@customElement('tab-tree')
export class TabTree extends SignalWatcher(LitElement) {
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

    /* Drag and Drop styles */
    sl-tree-item[data-drop-target] {
      outline: 2px dashed var(--sl-color-primary-500);
      outline-offset: -2px;
      border-radius: var(--sl-border-radius-medium);
      background-color: var(--sl-color-primary-50);
    }

    sl-tree-item.drag-hidden {
      display: none;
    }

    /* Drag hiding logic using CSS attribute selectors */
    :host([dragging-type="tab"]) sl-tree-item[item-type="tab"] {
      /* Hide other tabs, but we need to keep the dragging one?
         The CSS approach requested is simple "display: none".
         However, typically we want to exclude the dragged item if possible, or maybe hiding it is intended.
         If I hide the dragged item, the drag might end.
         Let's assume we want to hide ALL tabs for now based on the simplistic request.
         Wait, if I hide the dragged element, the drag event might get cancelled or 'dragend' fired immediately.
         But let's stick to the request.
         Actually, usually you hide "potential drop targets" that are invalid.
         If I am dragging a tab, I can drop on group or window.
         So tabs are invalid drop targets. So hiding them makes sense to reduce clutter.
         The dragged item is already being dragged.
      */
       display: none;
    }

    /* Exceptions for the dragged item itself?
       If we hide the dragged item, we might lose the drag.
       We can try to exclude the dragged item using a class or attribute if we had the ID in CSS.
       But we don't have dynamic ID in CSS.
       However, the prompt asks to implement it using CSS selectors.
       I will use the `class="drag-hidden"` logic removal and replace with this.
       I will ensure the dragged item is NOT hidden by adding a class to it like 'dragging' and excluding it?
       Or maybe the user implies simply:
    */
    :host([dragging-type="tab"]) sl-tree-item[item-type="tab"]:not([dragging]) {
      display: none;
    }

    :host([dragging-type="group"]) sl-tree-item[item-type="tab"] {
      display: none;
    }

    :host([dragging-type="window"]) sl-tree-item[item-type="tab"],
    :host([dragging-type="window"]) sl-tree-item[item-type="group"] {
      display: none;
    }
  `;

  @state() private draggingType: 'tab' | 'group' | 'window' | null = null;
  @state() private draggingId: number | null = null;
  @state() private dragOverId: number | null = null;
  @state() private dragOverType: 'tab' | 'group' | 'window' | null = null;

  connectedCallback(): void {
    super.connectedCallback();
  }

  render() {
    return html`
      <sl-tree selection="multiple" @sl-selection-change=${this.handleTreeSelectionChange}>
        ${repeat(tabStore.sortedWindows.get(), (window) => window.id, (window) => html`
          <sl-tree-item
            ?expanded=${this.draggingType ? true : !tabStore.collapsedWindowIds.has(window.id)}
            draggable="true"
            data-id=${window.id}
            data-type="window"
            item-type="window"
            ?dragging=${this.draggingType === 'window' && this.draggingId === window.id}
            ?data-drop-target=${this.isDropTarget('window', window.id)}
            @dragstart=${(e: DragEvent) => this.handleDragStart(e, 'window', window.id)}
            @dragover=${(e: DragEvent) => this.handleDragOver(e, 'window', window.id)}
            @drop=${(e: DragEvent) => this.handleDrop(e, 'window', window.id)}
            @dragend=${this.handleDragEnd}
            @dragenter=${(e: DragEvent) => this.handleDragEnter(e, 'window', window.id)}
            @dragleave=${this.handleDragLeave}
            @sl-expand=${(evt: CustomEvent) => this.handleWindowExpand(evt, window.id)}
            @sl-collapse=${(evt: CustomEvent) => this.handleWindowCollapse(evt, window.id)}
          >
            <window-item .window=${window}></window-item>

            ${repeat(window.groups, (group: GroupNode) => group.id, (group: GroupNode) => html`
              <sl-tree-item
                ?expanded=${this.draggingType ? true : !group.collapsed}
                ?selected=${group.tabs.every((t: TabNode) => tabStore.selectedTabIds.has(t.id))}
                draggable="true"
                data-id=${group.id}
                data-type="group"
                item-type="group"
                ?dragging=${this.draggingType === 'group' && this.draggingId === group.id}
                ?data-drop-target=${this.isDropTarget('group', group.id)}
                @dragstart=${(e: DragEvent) => this.handleDragStart(e, 'group', group.id)}
                @dragover=${(e: DragEvent) => this.handleDragOver(e, 'group', group.id)}
                @drop=${(e: DragEvent) => this.handleDrop(e, 'group', group.id)}
                @dragend=${this.handleDragEnd}
                @dragenter=${(e: DragEvent) => this.handleDragEnter(e, 'group', group.id)}
                @dragleave=${this.handleDragLeave}
                @sl-expand=${(evt: CustomEvent) => this.handleGroupExpand(evt, group.id)}
                @sl-collapse=${(evt: CustomEvent) => this.handleGroupCollapse(evt, group.id)}
              >
                <group-item
                  .group=${group}
                  @group-rename=${this.handleGroupRename}
                  @group-close=${this.handleGroupClose}
                ></group-item>

                ${repeat(group.tabs, (tab: TabNode) => tab.id, (tab: TabNode) => html`
                  <sl-tree-item
                    ?selected=${tabStore.selectedTabIds.has(tab.id)}
                    draggable="true"
                    data-id=${tab.id}
                    data-type="tab"
                    item-type="tab"
                    ?dragging=${this.draggingType === 'tab' && this.draggingId === tab.id}
                    @dragstart=${(e: DragEvent) => this.handleDragStart(e, 'tab', tab.id)}
                    @dragend=${this.handleDragEnd}
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

            ${repeat(window.tabs, (tab: TabNode) => tab.id, (tab: TabNode) => html`
              <sl-tree-item
                ?selected=${tabStore.selectedTabIds.has(tab.id)}
                draggable="true"
                data-id=${tab.id}
                data-type="tab"
                item-type="tab"
                ?dragging=${this.draggingType === 'tab' && this.draggingId === tab.id}
                @dragstart=${(e: DragEvent) => this.handleDragStart(e, 'tab', tab.id)}
                @dragend=${this.handleDragEnd}
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

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('draggingType')) {
      if (this.draggingType) {
        this.setAttribute('dragging-type', this.draggingType);
      } else {
        this.removeAttribute('dragging-type');
      }
    }
  }

  private isDropTarget(type: 'tab' | 'group' | 'window', id: number) {
    return this.dragOverType === type && this.dragOverId === id;
  }

  private handleDragStart(e: DragEvent, type: 'tab' | 'group' | 'window', id: number) {
    e.stopPropagation();
    this.draggingType = type;
    this.draggingId = id;

    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-taborg-type', type);
      e.dataTransfer.setData('application/x-taborg-id', String(id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private handleDragOver(e: DragEvent, type: 'tab' | 'group' | 'window', id: number) {
    e.preventDefault(); // Necessary to allow dropping
    e.stopPropagation();

    if (!this.draggingType || !this.draggingId) return;

    // Validate drop target
    let valid = false;

    if (this.draggingType === 'tab') {
      // Drop over group or window
      if (type === 'group' || type === 'window') valid = true;
    } else if (this.draggingType === 'group') {
      // Drop over group (merge) or window
      if ((type === 'group' && id !== this.draggingId) || type === 'window') valid = true;
    } else if (this.draggingType === 'window') {
      // Drop over window (merge)
      if (type === 'window' && id !== this.draggingId) valid = true;
    }

    if (valid) {
      this.dragOverType = type;
      this.dragOverId = id;
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    } else {
      this.dragOverType = null;
      this.dragOverId = null;
    }
  }

  private handleDragEnter(e: DragEvent, type: 'tab' | 'group' | 'window', id: number) {
     // Optional: specific styling on enter
  }

  private handleDragLeave(e: DragEvent) {
    // We might want to clear dragOver if we leave the element
    // But this fires when entering children too, so it's tricky.
    // simpler to let dragOver handle state setting.
  }

  private handleDragEnd(e: DragEvent) {
    this.draggingType = null;
    this.draggingId = null;
    this.dragOverType = null;
    this.dragOverId = null;
  }

  private async handleDrop(e: DragEvent, type: 'tab' | 'group' | 'window', id: number) {
    e.preventDefault();
    e.stopPropagation();

    const draggedType = this.draggingType;
    const draggedId = this.draggingId;

    this.handleDragEnd(e); // Reset state

    if (!draggedType || !draggedId) return;

    if (draggedType === 'tab') {
      if (type === 'window') {
        await tabStore.moveTabToWindow(draggedId, id);
      } else if (type === 'group') {
        await tabStore.moveTabToGroup(draggedId, id);
      }
    } else if (draggedType === 'group') {
      if (type === 'window') {
        await tabStore.moveGroupToWindow(draggedId, id);
      } else if (type === 'group') {
         if (confirm('Merge these groups?')) {
           await tabStore.mergeGroups(draggedId, id);
         }
      }
    } else if (draggedType === 'window') {
      if (type === 'window') {
        if (confirm('Merge these windows?')) {
          await tabStore.mergeWindows(draggedId, id);
        }
      }
    }
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
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { count: tabStore.selectedTabIds.size },
      bubbles: true,
      composed: true
    }));
  }

  private handleWindowExpand(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    tabStore.setWindowCollapsed(windowId, false);
  }

  private handleWindowCollapse(evt: CustomEvent, windowId: number) {
    evt.stopPropagation();
    tabStore.setWindowCollapsed(windowId, true);
  }
}
