import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { WindowNode, tabStore } from '../services/tab-store';
import { geminiService } from '../services/gemini';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

@customElement('window-item')
export class WindowItem extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .window-header {
      display: flex;
      align-items: center;
      padding: var(--sl-spacing-2x-small) var(--sl-spacing-x-small);
      font-weight: bold;
      color: var(--sl-color-neutral-500);
      font-size: var(--sl-font-size-x-small);
      text-transform: uppercase;
    }

    .window-name {
      flex-grow: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: var(--sl-spacing-x-small);
    }

    .count {
      font-weight: normal;
      font-size: var(--sl-font-size-x-small);
      color: var(--sl-color-neutral-500);
      margin-left: var(--sl-spacing-x-small);
      text-transform: none;
      white-space: nowrap;
    }

    .actions {
      display: flex;
      align-items: center;
      opacity: 0;
      transition: opacity var(--sl-transition-fast);
    }

    .window-header:hover .actions {
      opacity: 1;
    }

    sl-icon-button {
      font-size: var(--sl-font-size-medium);
    }
  `;

  @property({ type: Object }) window!: WindowNode;
  @state() private generatingName = false;

  render() {
    const tabCount = this.window.tabs.length + this.window.groups.reduce((acc, g) => acc + g.tabs.length, 0);
    const displayName = this.window.name || `Window ${this.window.id}`;

    return html`
      <div class="window-header">
        <span class="window-name">
          ${displayName} ${this.window.focused ? '(Current)' : ''}
        </span>

        <span class="count">
          (${tabCount} tabs)
        </span>

        <div class="actions">
          ${this.generatingName
            ? html`<sl-spinner style="font-size: var(--sl-font-size-medium); --track-width: 2px;"></sl-spinner>`
            : html`
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

  private async handleAutoName(e: Event) {
    e.stopPropagation();
    this.generatingName = true;

    try {
      // Collect all tabs and groups in this window
      const allTabs = [
        ...this.window.tabs,
        ...this.window.groups.flatMap(g => g.tabs)
      ];

      const groupNames = this.window.groups.map(g => g.title).filter(Boolean);

      const name = await geminiService.generateWindowName(
        allTabs.map(t => ({ title: t.title, url: t.url })),
        groupNames
      );

      if (name) {
        await tabStore.setWindowName(this.window.id, name);
      }
    } catch (err) {
      console.error('Failed to auto-name window:', err);
      alert('Failed to generate name. Check API key.');
    } finally {
      this.generatingName = false;
    }
  }
}
