import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { geminiService } from '../services/gemini.js';
import type { ConnectionStatus } from '../services/mcp-connection.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import type { SlDialog, SlInput, SlSwitch } from '@shoelace-style/shoelace';

@customElement('settings-dialog')
export class SettingsDialog extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }

    .section-title {
        font-size: var(--sl-font-size-medium);
        font-weight: var(--sl-font-weight-semibold);
        margin-bottom: var(--sl-spacing-x-small);
        color: var(--sl-color-neutral-700);
    }

    .status-row {
        display: flex;
        align-items: center;
        gap: var(--sl-spacing-medium);
        justify-content: space-between;
    }
  `;

  @state() private open = false;
  @state() private apiKey = '';
  @state() private predefinedGroups = '';
  @state() private mcpEnabled = true;

  @state() private mcpStatus: ConnectionStatus = 'disconnected';
  @state() private mcpError: string | null = null;

  @query('sl-dialog') dialog!: SlDialog;
  @query('#api-key-input') apiKeyInput!: SlInput;
  @query('#predefined-groups-input') predefinedGroupsInput!: SlInput;
  @query('#mcp-enabled-switch') mcpEnabledSwitch!: SlSwitch;

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('open-settings', this.handleOpenSettings);
    await geminiService.loadApiKey();
    const result = await chrome.storage.sync.get('geminiApiKey');
    if (result.geminiApiKey) {
      this.apiKey = '****************';
    }
    await this.loadPredefinedGroups();
    this.loadMcpSettings();
    this.startObservingMcp();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('open-settings', this.handleOpenSettings);
    chrome.storage.onChanged.removeListener(this.handleStorageChange);
  }

  private async loadPredefinedGroups() {
    const result = await chrome.storage.sync.get('predefined-groups');
    const groups = result['predefined-groups'] as string[] | undefined;
    if (groups && groups.length > 0) {
      this.predefinedGroups = groups.join(', ');
    }
  }

  private async loadMcpSettings() {
    const result = await chrome.storage.sync.get('mcp-enabled');
    this.mcpEnabled = result['mcp-enabled'] !== false; // Default to true
  }

  private async startObservingMcp() {
    // Initial fetch
    const session = await chrome.storage.session.get(['mcpStatus', 'mcpError']);
    if (session.mcpStatus) this.mcpStatus = session.mcpStatus as ConnectionStatus;
    if (session.mcpError) this.mcpError = session.mcpError as string;

    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'session') {
      if (changes.mcpStatus) {
        this.mcpStatus = changes.mcpStatus.newValue as ConnectionStatus;
      }
      if (changes.mcpError) {
        this.mcpError = changes.mcpError.newValue as string | null;
      }
    }
  };

  private handleOpenSettings = () => {
    this.open = true;
  };

  private handleClose = () => {
    this.open = false;
  };

  private async handleSave() {
    const key = this.apiKeyInput.value.trim();
    if (key && key !== '****************') {
      await geminiService.setApiKey(key);
    }

    // Save predefined groups
    const groupsText = this.predefinedGroupsInput.value.trim();
    const groups = groupsText
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    await chrome.storage.sync.set({ 'predefined-groups': groups });

    // Save MCP settings
    const mcpEnabled = this.mcpEnabledSwitch.checked;
    await chrome.storage.sync.set({ 'mcp-enabled': mcpEnabled });

    // Notify background
    chrome.runtime.sendMessage({ type: mcpEnabled ? 'MCP_CONNECT' : 'MCP_DISCONNECT' });

    this.open = false;
    alert('Settings saved!');
  }

  private handleRetryMcp() {
    chrome.runtime.sendMessage({ type: 'MCP_RETRY' });
  }

  private getStatusColor(status: ConnectionStatus) {
    switch (status) {
      case 'connected':
        return 'success';
      case 'connecting':
        return 'warning';
      case 'error':
        return 'danger';
      case 'disconnected':
        return 'neutral';
    }
  }

  render() {
    return html`
      <sl-dialog label="Settings" ?open=${this.open} @sl-after-hide=${() => {
        this.open = false;
      }}>
        <div class="content">
          <div class="section-title">Gemini API</div>
          <p>Enter your <a href="https://aistudio.google.com/app/api-keys">Gemini API Key</a> to enable auto-organization features.</p>
          <sl-input
            id="api-key-input"
            label="API Key"
            type="password"
            placeholder="AIza..."
            password-toggle
            value=${this.apiKey}
          ></sl-input>

          <sl-input
            id="predefined-groups-input"
            label="Predefined Groups (comma-separated)"
            placeholder="Work, Personal, Dev, News"
            value=${this.predefinedGroups}
            help-text="These group names will always be suggested as existing groups"
          ></sl-input>

          <div class="divider"></div>

          <div class="section-title">MCP Server</div>
          <p>Expose tab manipulation to LLMs via local MCP server (requires helper script).</p>

          <div class="status-row">
            <sl-switch id="mcp-enabled-switch" ?checked=${this.mcpEnabled}>Enable MCP Server</sl-switch>
             <sl-badge variant=${this.getStatusColor(this.mcpStatus)}>${this.mcpStatus}</sl-badge>
          </div>

          ${
            this.mcpStatus === 'disconnected' || this.mcpStatus === 'error'
              ? html`
             <sl-button size="small" variant="default" @click=${this.handleRetryMcp} ?disabled=${!this.mcpEnabled}>Reconnect Now</sl-button>
          `
              : ''
          }

          ${this.mcpError ? html`<div style="color: var(--sl-color-danger-600); font-size: var(--sl-font-size-small);">${this.mcpError}</div>` : ''}

        </div>
        <div slot="footer">
          <sl-button variant="primary" @click=${this.handleSave}>Save</sl-button>
          <sl-button variant="default" @click=${this.handleClose}>Close</sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
