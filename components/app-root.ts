import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { tabStore, TabStoreController } from '../services/tab-store';
import './tab-tree';
import './selected-pane';
import './control-bar';
import './settings-dialog';

@customElement('app-root')
export class AppRoot extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      background-color: var(--sl-color-neutral-0);
    }

    main {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .tree-container {
      flex: 1;
      overflow-y: auto;
      padding-bottom: var(--sl-spacing-medium);
    }

    .selected-pane-container {
      border-top: var(--sl-border-width) solid var(--sl-color-neutral-200);
      max-height: 30vh;
      overflow-y: auto;
      display: none; /* Hidden by default until selection exists */
    }

    .selected-pane-container.visible {
      display: block;
    }
  `;

  private store = new TabStoreController(this);

  render() {
    return html`
      <main>
        <div class="tree-container">
          <tab-tree></tab-tree>
        </div>
        <div class="selected-pane-container ${tabStore.selectedTabIds.size > 0 ? 'visible' : ''}">
          <selected-pane></selected-pane>
        </div>
      </main>
      <control-bar></control-bar>
      <settings-dialog></settings-dialog>
    `;
  }


}
