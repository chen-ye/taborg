import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { type TabNode, tabStore } from '../services/tabs/tab-store.js';
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
      display: grid;
      align-items: center;
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      border-radius: var(--sl-border-radius-medium);
      cursor: pointer;
      transition: background-color var(--sl-transition-fast);
      position: relative;
      gap: var(--sl-spacing-x-small);
      /* Default grid columns (will be overridden by modes) */
      grid-template-columns: min-content 1fr min-content;
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

    /* Grid Areas */
    .left {
      grid-area: title;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-2x-small);
    }

    .suggestions {
      grid-area: suggestions;
      display: flex;
      gap: var(--sl-spacing-2x-small);
      align-items: center;
      min-width: 0;
      overflow: hidden;
    }

    .right {
      grid-area: dropdown;
      display: flex;
      align-items: center;
    }

    .controls {
      grid-area: controls;
      display: flex;
      align-items: center;
    }

    /* Common Child Styles */
    sl-checkbox {
      margin-right: var(--sl-spacing-x-small);
    }

    .favicon {
      width: var(--sl-spacing-medium);
      height: var(--sl-spacing-medium);
      margin-right: var(--sl-spacing-x-small);
      border-radius: var(--sl-border-radius-small);
      flex-shrink: 0;
    }

    .title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: var(--sl-font-size-small);
      color: var(--sl-color-neutral-700);
    }

    group-tag {
      cursor: pointer;
    }

    group-tag:hover {
      opacity: 0.8;
    }

    sl-icon-button {
      font-size: var(--sl-font-size-small);
    }

    /* COMPACT MODE */
    .tab-row.compact {
        grid-template-columns: minmax(0, min-content) minmax(0, 1fr) min-content min-content;
        grid-template-areas: "title suggestions dropdown controls";
    }

    .tab-row.compact .controls {
        opacity: 0; /* Gutter reserved, but hidden */
        pointer-events: none;
    }

    .tab-row.compact:hover .controls {
        opacity: 1;
        pointer-events: auto;
    }

    /* DETAILED MODE */
    .tab-row.detailed {
        grid-template-columns: 1fr min-content auto;
        /* Rows defined by content */
    }

    /* Detailed: With Suggestions (2 Rows) */
    .tab-row.detailed.has-suggestions {
        grid-template-areas:
            "title title controls"
            "suggestions dropdown controls";
    }

    /* Detailed: No Suggestions (1 Row) */
    .tab-row.detailed:not(.has-suggestions) {
        grid-template-areas: "title dropdown controls";
        grid-template-columns: 1fr min-content auto;
    }

    /* In detailed mode, align controls to top or center? */
    .tab-row.detailed .controls {
        /* If 2 rows, span them? or just align to top row? */
        /* If we want it vertically centered across the whole card, default stretch/center works. */
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
    const viewMode = tabStore.viewOptions.get().viewMode;

    const hasSuggestions = suggestedGroups && suggestedGroups.length > 0;

    return html`
      <div
        class="tab-row ${this.tab.active ? 'active' : ''} ${viewMode} ${hasSuggestions ? 'has-suggestions' : ''}"
        @click=${this.focusTab}
        @auxclick=${this.handleAuxClick}
        draggable="true"
        @dragstart=${this.handleDragStart}
        @dragend=${this.handleDragEnd}
      >
        <!-- Title Area -->
        <div class="left">
          ${
            this.tab.favIconUrl
              ? html`<img class="favicon" src="${this.tab.favIconUrl}" />`
              : html`<div class="favicon" style="background: #ccc"></div>`
          }

          <span class="title" title="${this.tab.title}">${this.tab.title}</span>
        </div>

        <!-- Suggestions Area -->
        ${
          suggestedGroups && suggestedGroups.length > 0
            ? html`
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
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.moveToGroup(groupName);
                      }}
                    >
                      ${isNew ? html`<sl-icon name="plus"></sl-icon>` : ''}
                      ${groupName}
                    </group-tag>
                  `;
                },
              )}
            </div>
          `
            : html`<div class="suggestions" style="display:none"></div>`
          // Keep an empty div or handle via grid area?
          // If display:none, it doesn't take grid area.
          // In grid areas, if an element is missing, that area is empty.
        }

        <!-- Dropdown Area -->
        <div class="right">
          <div class="group-dropdown" @click=${(e: Event) => e.stopPropagation()}>
            <sl-dropdown placement="bottom-end" hoist @sl-show=${this.handleDropdownShow}>
              <group-tag slot="trigger" size="small" pill class="group-trigger">
                <sl-icon name="folder"></sl-icon>
              </group-tag>
              <sl-menu @sl-select=${this.handleGroupSelect}>
                ${
                  this.hasDropdownOpened
                    ? repeat(
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
                        },
                      )
                    : ''
                }
              </sl-menu>
            </sl-dropdown>
          </div>
        </div>

        <!-- Controls Area -->
        <div class="controls">
          <sl-button-group>
            <sl-button
              pill
              size="small"
              .disabled=${this.tab.active}
              @click=${this.moveTabAfterActive}
            >
              <sl-icon slot="prefix" name="arrow-down" label="Move after active tab"></sl-icon>
            </sl-button>
            <sl-button
              pill
              size="small"
              @click=${this.closeTab}
            >
              <sl-icon slot="prefix" name="x" label="Close Tab"></sl-icon>
          </sl-button>
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
    this.dispatchEvent(
      new CustomEvent('tab-focus', {
        detail: { id: this.tab.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleAuxClick(e: MouseEvent) {
    if (e.button === 1) {
      // Middle click
      e.preventDefault(); // Prevent default middle-click behavior (like autoscroll)
      this.closeTab(e);
    }
  }

  private closeTab(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('tab-close', {
        detail: { id: this.tab.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private moveTabAfterActive(e: Event) {
    e.stopPropagation();
    tabStore.moveTabAfterActive(this.tab.id);
  }

  private moveToGroup(groupName: string) {
    this.dispatchEvent(
      new CustomEvent('tab-move-to-group', {
        detail: { tabId: this.tab.id, groupName },
        bubbles: true,
        composed: true,
      }),
    );
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
