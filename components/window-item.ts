import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { geminiService } from '../services/gemini.js';
import { type GroupNode, tabStore, type WindowNode } from '../services/tab-store.js';
import { toast } from '../services/toast.js';
import { dropTargetStyles } from './shared-styles.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

@customElement('window-item')
export class WindowItem extends LitElement {
  static styles = [
    dropTargetStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        flex-grow: 1;
        user-select: none;
      }

      .window-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
        border-radius: var(--sl-border-radius-medium);
        cursor: pointer;
        transition: background-color var(--sl-transition-fast);
        font-weight: bold;
        color: var(--sl-color-neutral-500);
        font-size: var(--sl-font-size-x-small);
      }

      .window-row:hover {
        background-color: var(--sl-color-neutral-100);
      }

      .left {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: var(--sl-spacing-x-small);
      }

      .window-name {
        flex-grow: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-transform: uppercase;
        margin-right: var(--sl-spacing-x-small);
      }

      .name-input {
        flex-grow: 1;
        margin-right: var(--sl-spacing-x-small);
      }

      .count {
        font-weight: normal;
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-neutral-500);
        text-transform: none;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        margin-left: auto;
        gap: var(--sl-spacing-2x-small);
        opacity: 0;
        transition: opacity var(--sl-transition-fast);
      }

      .window-row:hover .controls,
      .window-row:focus-within .controls {
        opacity: 1;
      }

      sl-icon-button {
        font-size: var(--sl-font-size-medium);
      }

      sl-tooltip {
        text-transform: none;
      }
    `,
  ];

  @property({ type: Object }) window!: WindowNode;
  @property({ type: Boolean }) private generatingName = false;
  @property({ type: Boolean, reflect: true, attribute: 'drop-target' }) dropTarget = false;
  @state() isEditing = false;

  render() {
    const tabCount =
      this.window.tabs.length + this.window.groups.reduce((acc: number, g: GroupNode) => acc + g.tabs.length, 0);
    const displayName = tabStore.windowNames.get(this.window.id) || `Window ${this.window.id}`;

    return html`
      <div
        class="window-row"
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
                value=${displayName}
                @keydown=${this.handleInputKeyDown}
                @sl-blur=${this.saveName}
                @click=${(e: Event) => e.stopPropagation()}
                autofocus
              ></sl-input>
            `
              : html`
              <span class="window-name" @dblclick=${this.startEditing}>
                ${displayName} ${this.window.focused ? '(Current)' : ''}
              </span>
            `
          }

          <span class="count">
            (${tabCount} tabs)
          </span>
        </div>

        <div class="controls">
          ${
            this.generatingName
              ? html`<sl-spinner style="font-size: var(--sl-font-size-medium); --track-width: 2px;"></sl-spinner>`
              : html`
              <sl-tooltip content="Rename Window">
                <sl-icon-button
                  name="pencil"
                  label="Rename"
                  @click=${this.startEditing}
                ></sl-icon-button>
              </sl-tooltip>
              <sl-tooltip content="Auto-name Window">
                <sl-icon-button
                  name="stars"
                  label="Auto-name"
                  @click=${this.handleAutoName}
                ></sl-icon-button>
              </sl-tooltip>
            `
          }
        </div>
      </div>
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

  private async saveName(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value.trim();
    const currentName = tabStore.windowNames.get(this.window.id) || `Window ${this.window.id}`;

    if (newName && newName !== currentName) {
      await tabStore.setWindowName(this.window.id, newName);
    }

    this.isEditing = false;
  }

  private async handleAutoName(e: Event) {
    e.stopPropagation();
    this.generatingName = true;

    try {
      // Collect all tabs and groups in this window
      const allTabs = [...this.window.tabs, ...this.window.groups.flatMap((g: GroupNode) => g.tabs)];

      const groupNames = this.window.groups.reduce((acc: string[], g: GroupNode) => {
        if (g.title) {
          acc.push(g.title);
        }
        return acc;
      }, []);

      const name = await geminiService.generateWindowName(
        allTabs.map((t) => ({ title: t.title, url: t.url })),
        groupNames,
      );

      if (name) {
        await tabStore.setWindowName(this.window.id, name);
      }
    } catch (err) {
      console.error('Failed to auto-name window:', err);
      toast.error('Failed to generate name. Check API key.');
    } finally {
      this.generatingName = false;
    }
  }

  private handleDragStart(e: DragEvent) {
    console.log('[WindowItem] dragstart:', { windowId: this.window.id });
    e.stopPropagation();
    tabStore.draggingState.set({ type: 'window', id: this.window.id });

    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-taborg-type', 'window');
      e.dataTransfer.setData('application/x-taborg-id', String(this.window.id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private handleDragEnd(e: DragEvent) {
    console.log('[WindowItem] dragend:', { windowId: this.window.id });
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
    if (dragging.type === 'group') valid = true;
    if (dragging.type === 'window' && dragging.id !== this.window.id) valid = true;

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
    if (dragging.type === 'group') valid = true;
    if (dragging.type === 'window' && dragging.id !== this.window.id) valid = true;

    console.log('[WindowItem] dragenter:', { windowId: this.window.id, dragging, valid });
    if (valid) {
      this.dropTarget = true;
    }
  }

  private handleDragLeave(e: DragEvent) {
    console.log('[WindowItem] dragleave:', { windowId: this.window.id });
    e.stopPropagation();
    this.dropTarget = false;
  }

  private async handleDrop(e: DragEvent) {
    console.log('[WindowItem] drop:', { windowId: this.window.id, dragging: tabStore.draggingState.get() });
    e.preventDefault();
    e.stopPropagation();
    this.dropTarget = false;

    const dragging = tabStore.draggingState.get();
    if (!dragging) return;

    if (dragging.type === 'tab') {
      await tabStore.moveTabToWindow(dragging.id, this.window.id);
    } else if (dragging.type === 'group') {
      await tabStore.moveGroupToWindow(dragging.id, this.window.id);
    } else if (dragging.type === 'window') {
      this.dispatchEvent(
        new CustomEvent('merge-request', {
          detail: { type: 'merge-windows', sourceId: dragging.id, targetId: this.window.id },
          bubbles: true,
          composed: true,
        }),
      );
    }

    tabStore.draggingState.set(null); // Clear state
  }
}
