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
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import type { SlDialog, SlInput, SlSwitch } from '@shoelace-style/shoelace';
import { ifDefined } from 'lit/directives/if-defined.js';
import { Signal } from 'signal-polyfill';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

class SettingState<T> {
  current = new Signal.State<T>(null!);
  original = new Signal.State<T>(null!);
  status = new Signal.State<SaveStatus>('idle');

  get isDirty() {
    return this.current.get() !== this.original.get();
  }

  constructor(initialValue: T) {
    this.current.set(initialValue);
    this.original.set(initialValue);
  }

  reset() {
    this.current.set(this.original.get());
    this.status.set('idle');
  }

  update(value: T) {
    this.current.set(value);
    if (this.status.get() === 'saved' || this.status.get() === 'error') {
      this.status.set('idle');
    }
  }

  async save(saveFn: (value: T) => Promise<void>) {
    if (!this.isDirty) return;

    this.status.set('saving');
    try {
      const value = this.current.get();
      await saveFn(value);
      this.original.set(value);
      this.status.set('saved');

      // Reset saved status after a delay to fade out the checkmark
      setTimeout(() => {
        if (this.status.get() === 'saved') {
          this.status.set('idle');
        }
      }, 2000);
    } catch (e) {
      console.error('Failed to save setting:', e);
      this.status.set('error');
    }
  }
}

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

    .setting-row {
      display: flex;
      align-items: flex-end; /* Align input bottom with actions */
      gap: var(--sl-spacing-small);
      width: 100%;
    }

    .setting-input {
      flex: 1;
    }

    .setting-actions {
      display: flex;
      align-items: center;
      gap: 4px; /* Tight gap for actions */
      height: 40px; /* Match standard input height approx */
      width: 24px; /* Fixed width to prevent layout shift */
    }

    sl-icon-button {
      font-size: var(--sl-font-size-large);
    }

    .status-icon {
      font-size: var(--sl-font-size-large);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-icon[name="check-circle"] {
      color: var(--sl-color-success-600);
      animation: fade-in 0.2s ease-out;
    }

    .status-icon[name="exclamation-circle"] {
       color: var(--sl-color-danger-600);
    }

    @keyframes fade-in {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
  `;

  @state() private open = false;

  // Use signals for granular state
  private apiKey = new SettingState<string>('');
  private predefinedGroups = new SettingState<string>('');

  @state() private mcpEnabled = true;

  @state() private mcpStatus: ConnectionStatus = 'disconnected';
  @state() private mcpError: string | null = null;

  @query('sl-dialog') dialog!: SlDialog;
  @query('#mcp-enabled-switch') mcpEnabledSwitch!: SlSwitch;

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('open-settings', this.handleOpenSettings);

    // Load API Key
    await geminiService.loadApiKey();
    const result = await chrome.storage.sync.get('geminiApiKey');
    if (result.geminiApiKey) {
      // Don't show the actual key, just a placeholder if it exists
      // If we used the real key it would be insecure to display it
      // But for edit tracking, we initialize with empty or placeholder?
      // User requirements said "with the ability to cancel...".
      // Let's assume we load empty or mask.
      // If we mask, editing becomes replacement.
      // Existing logic used '****************'
      this.apiKey = new SettingState('****************');
    }

    // Load Groups
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
      this.predefinedGroups = new SettingState(groups.join(', '));
    } else {
      this.predefinedGroups = new SettingState('');
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

  // Generic render helper for text settings
  private renderStringSetting(
    label: string,
    setting: SettingState<string>,
    saveFn: (val: string) => Promise<void>,
    opts: { type?: 'text' | 'password'; placeholder?: string; helpText?: string; id?: string } = {},
  ) {
    const { type = 'text', placeholder, helpText, id } = opts;

    return html`
      <div class="setting-row">
        <sl-input
          class="setting-input"
          id=${id || ''}
          label=${label}
          type=${type}
          placeholder=${ifDefined(placeholder)}
          help-text=${ifDefined(helpText)}
          ?password-toggle=${type === 'password'}
          .value=${setting.current.get()}
          @sl-input=${(e: Event) => setting.update((e.target as SlInput).value)}
          @sl-blur=${() => setting.save(saveFn)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              (e.target as HTMLElement).blur(); // Trigger blur to save
            }
            if (e.key === 'Escape') {
              setting.reset();
              (e.target as HTMLElement).blur();
            }
          }}
        ></sl-input>

        <div class="setting-actions">
          ${
            setting.isDirty
              ? html`
                <sl-icon-button
                  name="arrow-counterclockwise"
                  label="Revert"
                  @click=${() => setting.reset()}
                ></sl-icon-button>
              `
              : setting.status.get() === 'saved'
                ? html`<sl-icon name="check-circle" class="status-icon"></sl-icon>`
                : setting.status.get() === 'error'
                  ? html`<sl-icon name="exclamation-circle" class="status-icon"></sl-icon>`
                  : ''
          }
        </div>
      </div>
    `;
  }

  private async saveApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await geminiService.setApiKey(trimmed);
    }
  }

  private async savePredefinedGroups(groupsText: string) {
    const groups = groupsText
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    await chrome.storage.sync.set({ 'predefined-groups': groups });
  }

  private async toggleMcp(e: CustomEvent) {
    const enabled = (e.target as SlSwitch).checked;
    this.mcpEnabled = enabled;
    await chrome.storage.sync.set({ 'mcp-enabled': enabled });

    // Notify background
    chrome.runtime.sendMessage({ type: enabled ? 'MCP_CONNECT' : 'MCP_DISCONNECT' });
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

          ${this.renderStringSetting('API Key', this.apiKey, this.saveApiKey.bind(this), {
            type: 'password',
            placeholder: 'AIza...',
            id: 'api-key-input',
          })}

          ${this.renderStringSetting(
            'Predefined Groups (comma-separated)',
            this.predefinedGroups,
            this.savePredefinedGroups.bind(this),
            {
              placeholder: 'Work, Personal, Dev, News',
              id: 'predefined-groups-input',
              helpText: 'These group names will always be suggested as existing groups',
            },
          )}

          <div class="divider"></div>

          <div class="section-title">MCP Server</div>
          <p>Expose tab manipulation to LLMs via local MCP server (requires helper script).</p>

          <div class="status-row">
            <sl-switch
              id="mcp-enabled-switch"
              ?checked=${this.mcpEnabled}
              @sl-change=${this.toggleMcp}
            >Enable MCP Server</sl-switch>
            <div style="display: flex; align-items: center; gap: var(--sl-spacing-small);">
              <sl-badge variant=${this.getStatusColor(this.mcpStatus)}>${this.mcpStatus}</sl-badge>
              <sl-icon-button
                name="arrow-clockwise"
                label="Reconnect MCP Server"
                style="font-size: var(--sl-font-size-large);"
                ?disabled=${!this.mcpEnabled}
                @click=${this.handleRetryMcp}
              ></sl-icon-button>
            </div>
          </div>

          ${this.mcpError ? html`<div style="color: var(--sl-color-danger-600); font-size: var(--sl-font-size-small);">${this.mcpError}</div>` : ''}

        </div>
        <div slot="footer">
          <sl-button variant="default" @click=${this.handleClose}>Close</sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
