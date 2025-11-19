import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { TabNode, tabStore } from '../services/tab-store';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import './group-tag';

@customElement('tab-item')
export class TabItem extends LitElement {
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
      right: var(--sl-spacing-2x-small);
      height: 100%;
      background: linear-gradient(to right, transparent, var(--sl-color-neutral-100) 20%);
      padding-left: 2px;
    }

    .tab-row:hover .controls {
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-2x-small);
    }

    .right {
      display: flex;
      align-items: center;
      gap: var(--sl-spacing-2x-small);
      margin-left: auto;
      margin-right: var(--sl-spacing-large);
    }

    sl-icon-button {
      font-size: var(--sl-font-size-medium);
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
  `;

  @property({ type: Object }) tab!: TabNode;

  @state()
  private sortedSuggestedGroups: string[] = [];

  willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    // Recalculate sorted suggested groups when tab changes or groups change
    // (sorting depends on which groups exist, not just the suggested groups list)
    if (this.tab?.suggestedGroups && this.tab.suggestedGroups.length > 0) {
      this.sortedSuggestedGroups = this.tab.suggestedGroups.toSorted((a, b) => {
        const aExists = !!tabStore.getGroupByName(a);
        const bExists = !!tabStore.getGroupByName(b);
        // Sort new groups (non-existing) first
        if (!aExists && bExists) return -1;
        if (aExists && !bExists) return 1;
        return 0;
      });
    }
  }

  render() {
    return html`
      <div
        class="tab-row ${this.tab.active ? 'active' : ''}"
        @click=${this.focusTab}
        @auxclick=${this.handleAuxClick}
      >
        <div class="left">
          ${this.tab.favIconUrl
            ? html`<img class="favicon" src="${this.tab.favIconUrl}" />`
            : html`<div class="favicon" style="background: #ccc"></div>`
          }

          <span class="title" title="${this.tab.title}">${this.tab.title}</span>
        </div>

        <div class="right">
          ${this.tab.suggestedGroups && this.tab.suggestedGroups.length > 0 ? html`
            <div class="suggestions">
              ${repeat(
                this.sortedSuggestedGroups,
                (groupName) => groupName,
                (groupName) => {
                  const existingGroup = tabStore.getGroupByName(groupName);
                  const isNew = !existingGroup;

                  return html`
                    <group-tag
                      size="small"
                      pill
                      .color=${existingGroup?.color}
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
            <sl-dropdown placement="bottom-end" hoist>
              <group-tag slot="trigger" size="small" pill class="group-trigger">
                <sl-icon name="folder"></sl-icon>
              </group-tag>
              <sl-menu @sl-select=${this.handleGroupSelect}>
                ${repeat(
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
                )}
              </sl-menu>
            </sl-dropdown>
          </div>
        </div>

        <div class="controls">
          <sl-icon-button
            name="x"
            label="Close Tab"
            @click=${this.closeTab}
          ></sl-icon-button>
        </div>
      </div>
    `;
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
}
