import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { type GroupNode, tabStore } from '../services/tabs/tab-store.js';
import { dropTargetStyles } from './shared-styles.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import './group-tag';

@customElement('group-item')
export class GroupItem extends LitElement {
  static styles = [
    dropTargetStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        flex-grow: 1;
        user-select: none;
      }

      .group-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
        border-radius: var(--sl-border-radius-medium);
        cursor: pointer;
        transition: background-color var(--sl-transition-fast);
      }

      .group-row:hover {
        background-color: var(--sl-color-neutral-100);
      }

      .left {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: var(--sl-spacing-x-small);
      }

      sl-checkbox {
        margin-right: var(--sl-spacing-x-small);
      }

      .controls {
        display: flex;
        margin-left: auto;
        gap: var(--sl-spacing-2x-small);
        opacity: 0;
        transition: opacity var(--sl-transition-fast);
      }

      .group-row:hover .controls,
      .group-row:focus-within .controls {
        opacity: 1;
      }

      .name-input {
        flex-grow: 1;
        margin-right: var(--sl-spacing-x-small);
      }

      sl-icon-button {
        font-size: var(--sl-font-size-medium);
      }

      .count {
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-neutral-500);
      }
    `,
  ];

  @property({ type: Object }) group!: GroupNode;
  @property({ type: Boolean, reflect: true, attribute: 'drop-target' }) dropTarget = false;
  @state() isEditing = false;

  render() {
    return html`
      <div
        class="group-row"
        draggable="true"
        @dragstart=${this.handleDragStart}
        @dragend=${this.handleDragEnd}
        @dragover=${this.handleDragOver}
        @drop=${this.handleDrop}
        @dragenter=${this.handleDragEnter}
        @dragleave=${this.handleDragLeave}
      >
        <div class="left">
          ${
            this.isEditing
              ? html`
              <sl-input
                class="name-input"
                size="small"
                value=${this.group.title}
                @keydown=${this.handleInputKeyDown}
                @sl-blur=${this.saveName}
                @click=${(e: Event) => e.stopPropagation()}
                autofocus
              ></sl-input>
            `
              : html`
              <group-tag
                size="medium"
                pill
                .color=${this.group.color}
                @dblclick=${this.startEditing}
              >
                ${this.group.title || 'Group'}
              </group-tag>

              <span class="count">
                (${this.group.tabs.length} tab${this.group.tabs.length === 1 ? '' : 's'})
              </span>
            `
          }
        </div>
        <div class="controls">
          <sl-icon-button
            name="pencil"
            label="Rename"
            @click=${this.startEditing}
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

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('isEditing') && this.isEditing) {
      // Focus the input when editing starts
      const input = this.renderRoot.querySelector('.name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select(); // Also select all text for easier editing
      }
    }
  }

  private startEditing(e: Event) {
    e.stopPropagation();
    this.isEditing = true;
  }

  private handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.stopPropagation();
      (e.target as HTMLElement).blur(); // Triggers saveName via sl-blur
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      this.isEditing = false;
    }
  }

  private saveName(e: Event) {
    const input = e.target as HTMLInputElement;
    const newTitle = input.value.trim();

    if (newTitle && newTitle !== this.group.title) {
      this.dispatchEvent(
        new CustomEvent('group-rename', {
          detail: { id: this.group.id, title: newTitle },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this.isEditing = false;
  }

  private closeGroup(e: Event) {
    e.stopPropagation();
    if (confirm('Are you sure you want to close this group and all its tabs?')) {
      this.dispatchEvent(
        new CustomEvent('group-close', {
          detail: { id: this.group.id },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private handleDragStart(e: DragEvent) {
    console.log('[GroupItem] dragstart:', { groupId: this.group.id });
    e.stopPropagation();
    tabStore.draggingState.set({ type: 'group', id: this.group.id });

    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-taborg-type', 'group');
      e.dataTransfer.setData('application/x-taborg-id', String(this.group.id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private handleDragEnd(e: DragEvent) {
    console.log('[GroupItem] dragend:', { groupId: this.group.id });
    e.stopPropagation();
    tabStore.draggingState.set(null);
    this.dropTarget = false;
  }

  private handleDragOver(e: DragEvent) {
    e.stopPropagation();
    const dragging = tabStore.draggingState.get();
    if (!dragging) return;

    let valid = false;
    if (dragging.type === 'tab') valid = true;
    if (dragging.type === 'group' && dragging.id !== this.group.id) valid = true;

    if (valid) {
      e.preventDefault(); // Allow drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  }

  private handleDragEnter(e: DragEvent) {
    e.stopPropagation();
    const dragging = tabStore.draggingState.get();
    if (!dragging) return;

    let valid = false;
    if (dragging.type === 'tab') valid = true;
    if (dragging.type === 'group' && dragging.id !== this.group.id) valid = true;

    console.log('[GroupItem] dragenter:', { groupId: this.group.id, dragging, valid });
    if (valid) {
      this.dropTarget = true;
    }
  }

  private handleDragLeave(e: DragEvent) {
    console.log('[GroupItem] dragleave:', { groupId: this.group.id });
    e.stopPropagation();
    this.dropTarget = false;
  }

  private async handleDrop(e: DragEvent) {
    console.log('[GroupItem] drop:', { groupId: this.group.id, dragging: tabStore.draggingState.get() });
    e.preventDefault();
    e.stopPropagation();
    this.dropTarget = false;

    const dragging = tabStore.draggingState.get();
    if (!dragging) return;

    if (dragging.type === 'tab') {
      await tabStore.moveTabToGroup(dragging.id, this.group.id);
    } else if (dragging.type === 'group') {
      this.dispatchEvent(
        new CustomEvent('merge-request', {
          detail: { type: 'merge-groups', sourceId: dragging.id, targetId: this.group.id },
          bubbles: true,
          composed: true,
        }),
      );
    }

    tabStore.draggingState.set(null); // Clear state
  }
}
