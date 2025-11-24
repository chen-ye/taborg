import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { GroupNode } from '../services/tab-store.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import './group-tag';

@customElement('group-item')
export class GroupItem extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-width: 0;
      flex-grow: 1;
    }

    .group-row {
      display: flex;
      align-items: center;
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      border-radius: var(--sl-border-radius-medium);
      cursor: pointer;
      transition: background-color var(--sl-transition-fast);
    }

    .group-row:hover {
      background-color: var(--sl-color-neutral-100);
    }

    sl-checkbox {
      margin-right: var(--sl-spacing-x-small);
    }

    .controls {
      display: none;
      margin-left: auto;
      gap: var(--sl-spacing-2x-small);
    }

    .group-row:hover .controls {
      display: flex;
    }

    sl-icon-button {
      font-size: var(--sl-font-size-medium);
    }

    .count {
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      margin-left: var(--sl-spacing-x-small);
    }
  `;

  @property({ type: Object }) group!: GroupNode;

  render() {
    return html`
      <div class="group-row">
        <group-tag
          size="medium"
          pill
          .color=${this.group.color}
        >
          ${this.group.title || 'Group'}
        </group-tag>

        <span class="count">
          (${this.group.tabs.length} tab${this.group.tabs.length === 1 ? '' : 's'})
        </span>

        <div class="controls">
          <sl-icon-button
            name="pencil"
            label="Rename"
            @click=${this.renameGroup}
          ></sl-icon-button>

          <sl-icon-button
            name="x"
            label="Close Group"
            @click=${this.closeGroup}
          ></sl-icon-button>
        </div>
      </div>

      <slot></slot>
    `;
  }

  private renameGroup(e: Event) {
    e.stopPropagation();
    const newTitle = prompt('Enter new group name:', this.group.title);
    if (newTitle !== null) {
      this.dispatchEvent(new CustomEvent('group-rename', {
        detail: { id: this.group.id, title: newTitle },
        bubbles: true,
        composed: true
      }));
    }
  }

  private closeGroup(e: Event) {
    e.stopPropagation();
    if (confirm('Are you sure you want to close this group and all its tabs?')) {
      this.dispatchEvent(new CustomEvent('group-close', {
        detail: { id: this.group.id },
        bubbles: true,
        composed: true
      }));
    }
  }
}
