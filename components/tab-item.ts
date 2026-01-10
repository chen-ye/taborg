import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { TabNode, tabStore } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/button-group/button-group.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import './group-tag';

@customElement('tab-item')
export class TabItem extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: flex;
      position: relative;
      min-width: 0;
      flex-grow: 1;
    }

    .tab-row {
      min-width: 0;
      flex-grow: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      border-radius: var(--sl-border-radius-medium);
      cursor: pointer;
      transition: background-color var(--sl-transition-fast);
    }

    .tab-row:hover {
      background-color: var(--sl-color-neutral-100);
    }

    .tab-row.selected {
      background-color: var(--sl-color-primary-50);
    }

    .tab-row.active {
      border-left: 3px solid var(--sl-color-primary-600);
      padding-left: calc(var(--sl-spacing-x-small) - 3px);
    }

    .left {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-2x-small);
    }

    sl-checkbox {
      margin-right: var(--sl-spacing-x-small);
    }

    .favicon {
      width: var(--sl-spacing-medium);
      height: var(--sl-spacing-medium);
      margin-right: var(--sl-spacing-x-small);
      border-radius: var(--sl-border-radius-small);
    }

    .title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
    }

    .suggestions {
      display: flex;
      gap: var(--sl-spacing-2x-small);
      align-items: center;
      align-items: center;
    }

    group-tag {
      cursor: pointer;
    }

    group-tag:hover {
      opacity: 0.8;
    }

    .controls {
      display: none;
      position: absolute;
      left: var(--sl-spacing-2x-small);
      height: 100%;
      padding-left: 2px;
    }

    .tab-row:hover .controls {
      display: flex;
      align-items: center;
    }

    .right {
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-2x-small);
      margin-left: auto;
    }

    sl-icon-button {
      font-size: var(--sl-font-size-small);
    }



    .group-dropdown {
      display: block;
    }

    .group-trigger {
      cursor: pointer;
      &::part(base) {
        padding: 0 6px;
      }
    }

    /* Ensure pointer events work for drag start */
    :host {
      user-select: none;
    }
  `;

  @property({ type: Object }) tab!: TabNode;


  @state() private hasDropdownOpened = false;

  render() {
    const suggestedGroups = this.tab.url ? tabStore.suggestionsUrlMap.get(this.tab.url) : undefined;

    return html`
      <div
        class="tab-row ${this.tab.active ? 'active' : ''}"
        @click=${this.focusTab}
        @auxclick=${this.handleAuxClick}
        draggable="true"
        @dragstart=${this.handleDragStart}
        @dragend=${this.handleDragEnd}
      >
        <div class="left">
          ${this.tab.favIconUrl
            ? html`<img class="favicon" src="${this.tab.favIconUrl}" />`
            : html`<div class="favicon" style="background: #ccc"></div>`
          }

          <span class="title" title="${this.tab.title}">${this.tab.title}</span>
        </div>

        <div class="right">
          ${suggestedGroups && suggestedGroups.length > 0 ? html`
            <div class="suggestions">
              ${repeat(
                suggestedGroups,
                (groupName: string) => groupName,
                (groupName: string) => {
                  const existingGroup = tabStore.getGroupByName(groupName);
                  const isNew = !existingGroup;

                  return html`
                    <group-tag
                      size="small"
                      pill
                      .color=${existingGroup?.color}
                      style="order: ${isNew ? 0 : 1}"
                      @click=${(e: Event) => { e.stopPropagation(); this.moveToGroup(groupName); }}
                    >
                      ${isNew ? html`<sl-icon name="plus"></sl-icon>` : ''}
                      ${groupName}
                    </group-tag>
                  `;
                }
              )}
            </div>
          ` : ''}

          <div class="group-dropdown" @click=${(e: Event) => e.stopPropagation()}>
            <sl-dropdown placement="bottom-end" hoist @sl-show=${this.handleDropdownShow}>
              <group-tag slot="trigger" size="small" pill class="group-trigger">
                <sl-icon name="folder"></sl-icon>
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
        </div>

        <div class="controls">
          <sl-button-group>
            <sl-button
              pill
              size="small"
              @click=${this.closeTab}
            >
              <sl-icon slot="prefix" name="x" label="Close Tab"></sl-icon>
            </sl-button>
            ${!this.tab.active ? html`
              <sl-button
                pill
                size="small"
                @click=${this.moveTabAfterActive}
              >
                <sl-icon slot="prefix" name="arrow-down" label="Move after active tab"></sl-icon>
              </sl-button>
            ` : ''}
          </sl-button-group>
        </div>
      </div>
    `;
  }

  private handleDropdownShow() {
    this.hasDropdownOpened = true;
  }



  private getShoelaceColor(color: string) {
    return color === 'grey' ? 'neutral' : color;
  }

  private focusTab(evt: Event) {
    evt.stopPropagation();
    this.dispatchEvent(new CustomEvent('tab-focus', {
      detail: { id: this.tab.id },
      bubbles: true,
      composed: true
    }));
  }

  private handleAuxClick(e: MouseEvent) {
    if (e.button === 1) { // Middle click
      e.preventDefault(); // Prevent default middle-click behavior (like autoscroll)
      this.closeTab(e);
    }
  }

  private closeTab(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('tab-close', {
      detail: { id: this.tab.id },
      bubbles: true,
      composed: true
    }));
  }

  private moveTabAfterActive(e: Event) {
    e.stopPropagation();
    tabStore.moveTabAfterActive(this.tab.id);
  }

  private moveToGroup(groupName: string) {
    this.dispatchEvent(new CustomEvent('tab-move-to-group', {
      detail: { tabId: this.tab.id, groupName },
      bubbles: true,
      composed: true
    }));
  }



  private handleGroupSelect(e: CustomEvent) {
    const item = e.detail.item;
    const groupName = item.value;
    this.moveToGroup(groupName);
  }

  private handleDragStart(e: DragEvent) {
    console.log('[TabItem] dragstart:', { tabId: this.tab.id });
    e.stopPropagation();
    tabStore.draggingState.set({ type: 'tab', id: this.tab.id });

    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-taborg-type', 'tab');
      e.dataTransfer.setData('application/x-taborg-id', String(this.tab.id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private handleDragEnd(e: DragEvent) {
    console.log('[TabItem] dragend:', { tabId: this.tab.id });
    e.stopPropagation();
    tabStore.draggingState.set(null);
  }
}
