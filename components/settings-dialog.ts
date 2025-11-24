import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { geminiService } from '../services/gemini.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import type { SlDialog, SlInput } from '@shoelace-style/shoelace';

@customElement('settings-dialog')
export class SettingsDialog extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }
  `;

  @state() private open = false;
  @state() private apiKey = '';
  @state() private predefinedGroups = '';

  @query('sl-dialog') dialog!: SlDialog;
  @query('#api-key-input') apiKeyInput!: SlInput;
  @query('#predefined-groups-input') predefinedGroupsInput!: SlInput;

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('open-settings', this.handleOpenSettings);
    await geminiService.loadApiKey();
    await this.loadPredefinedGroups();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('open-settings', this.handleOpenSettings);
  }

  private async loadPredefinedGroups() {
    const result = await chrome.storage.sync.get('predefined-groups');
    const groups = result['predefined-groups'] as string[] | undefined;
    if (groups && groups.length > 0) {
      this.predefinedGroups = groups.join(', ');
    }
  }

  private handleOpenSettings = () => {
    this.open = true;
  };

  private handleClose = () => {
    this.open = false;
  };

  private async handleSave() {
    const key = this.apiKeyInput.value.trim();
    if (key) {
      await geminiService.setApiKey(key);
    }

    // Save predefined groups
    const groupsText = this.predefinedGroupsInput.value.trim();
    const groups = groupsText
      .split(',')
      .map(g => g.trim())
      .filter(g => g.length > 0);

    await chrome.storage.sync.set({ 'predefined-groups': groups });

    this.open = false;
    alert('Settings saved!');
  }

  render() {
    return html`
      <sl-dialog label="Settings" ?open=${this.open} @sl-after-hide=${() => this.open = false}>
        <div class="content">
          <p>Enter your Gemini API Key to enable auto-organization features.</p>
          <sl-input
            id="api-key-input"
            label="API Key"
            type="password"
            placeholder="AIza..."
            password-toggle
          ></sl-input>

          <sl-input
            id="predefined-groups-input"
            label="Predefined Groups (comma-separated)"
            placeholder="Work, Personal, Dev, News"
            value=${this.predefinedGroups}
            help-text="These group names will always be suggested as existing groups"
          ></sl-input>
        </div>
        <div slot="footer">
          <sl-button variant="primary" @click=${this.handleSave}>Save</sl-button>
          <sl-button variant="default" @click=${this.handleClose}>Close</sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
