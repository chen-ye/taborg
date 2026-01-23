import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { tabStore } from '../services/tab-store.js';
import './tab-tree';
import './selected-pane';
import './similar-pane';
import './control-bar';
import './settings-dialog';
import '@shoelace-style/shoelace/dist/components/details/details.js';
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

    .tree-container {
      flex: 1;
      overflow-y: auto;
      scrollbar-gutter: stable;
    }

    .bottom-panels {
      background-color: var(--sl-color-neutral-50);
      border-top: 1px solid var(--sl-color-neutral-200);
    }

    /* Hide the container if no panels are visible to avoid double borders or empty space logic?
       Actually sl-details handles itself. If both are hidden, the container is empty.
       We might want to hide the border-top if empty. */
    .bottom-panels:empty {
      display: none;
      border-top: none;
    }

    sl-details {
      border: none;
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

    sl-details:last-of-type {
      border-bottom: none;
    }

    sl-details::part(base) {
      border: none;
    }

    sl-details::part(header) {
      padding: var(--sl-spacing-x-small) var(--sl-spacing-small);
      font-size: var(--sl-font-size-small);
      font-weight: var(--sl-font-weight-semibold);
      background-color: var(--sl-color-neutral-100);
    }

    sl-details::part(content) {
      padding: 0;
      /* Max height for content as requested */
      max-height: 20vh;
      overflow-y: auto;
      scrollbar-gutter: stable;
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

    const selectedCount = tabStore.selectedTabIds.size;
    const similarCount = tabStore.similarTabs.get().length;

    return html`
      <main>
        <div class="tree-container">
          <tab-tree></tab-tree>
        </div>

        <div class="bottom-panels">
          <sl-details
            summary="Similar (${similarCount})"
            .duration=${250}
            .easing=${'cubic-bezier(0.175, 0.885, 0.32, 1.275)'}
          >
            <similar-pane></similar-pane>
          </sl-details>
          <sl-details
            summary="Selected (${selectedCount})"
            .duration=${250}
            .easing=${'cubic-bezier(0.175, 0.885, 0.32, 1.275)'}
          >
            <selected-pane></selected-pane>
          </sl-details>
        </div>
      </main>
      <control-bar></control-bar>
      <settings-dialog></settings-dialog>
    `;
  }
}
