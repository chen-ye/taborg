import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { tabStore } from '../services/tab-store.js';
import { SignalWatcher } from '@lit-labs/signals';
import './tab-tree';
import './selected-pane';
import './control-bar';
import './settings-dialog';
import '@shoelace-style/shoelace/dist/components/split-panel/split-panel.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';

@customElement('app-root')
export class AppRoot extends SignalWatcher(LitElement) {
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
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    sl-split-panel {
      --min: 200px;
      --max: calc(100% - 200px);
      height: 100%;
    }

    sl-split-panel::part(divider) {
      background-color: var(--sl-color-neutral-200);
    }

    .tree-container {
      height: 100%;
      overflow-y: auto;
    }

    .selected-pane-container {
      height: 100%;
      overflow-y: auto;
      background-color: var(--sl-color-neutral-50);
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }
  `;



  render() {
    console.log('Render');

    if (tabStore.isInitializing.get()) {
      return html`
        <main>
          <div class="loading-container">
            <sl-spinner style="font-size: 3rem;"></sl-spinner>
            <div>Loading tabs...</div>
          </div>
        </main>
        <control-bar></control-bar>
        <settings-dialog></settings-dialog>
      `;
    }

    const hasSelection = tabStore.selectedTabIds.size > 0;

    return html`
      <main>
        ${hasSelection ? html`
          <sl-split-panel vertical position="70">
            <div slot="start" class="tree-container">
              <tab-tree></tab-tree>
            </div>
            <div slot="end" class="selected-pane-container">
              <selected-pane></selected-pane>
            </div>
          </sl-split-panel>
        ` : html`
          <div class="tree-container">
            <tab-tree></tab-tree>
          </div>
        `}
      </main>
      <control-bar></control-bar>
      <settings-dialog></settings-dialog>
    `;
  }


}
