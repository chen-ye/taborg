import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { ConnectionStatus } from '../services/mcp/mcp-connection.js';
import type { AutoCategorizationMode, LLMStrategyType } from '../types/llm-types.js';
import { MessageTypes } from '../utils/message-types.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import type { SlDialog, SlInput, SlSelect, SlSwitch } from '@shoelace-style/shoelace';
import { ifDefined } from 'lit/directives/if-defined.js';
import { Signal } from 'signal-polyfill';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

class SettingState<T> {
  current: Signal.State<T>;
  original: Signal.State<T>;
  status = new Signal.State<SaveStatus>('idle');

  get isDirty() {
    return this.current.get() !== this.original.get();
  }

  constructor(initialValue: T) {
    this.current = new Signal.State(initialValue);
    this.original = new Signal.State(initialValue);
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
  private geminiApiKey = new SettingState<string>('');
  private geminiModelId = new SettingState<string>('gemini-1.5-flash');
  private openaiApiKey = new SettingState<string>('');
  private openaiModelId = new SettingState<string>('gpt-4o');
  private openaiCustomBaseUrl = new SettingState<string>('');
  private openaiCustomApiKey = new SettingState<string>('');
  private openaiCustomModelId = new SettingState<string>('gpt-4o');
  private predefinedGroups = new SettingState<string>('');
  private activeProvider = new SettingState<string>('gemini');
  private strategyOverride = new SettingState<LLMStrategyType>('default');
  private fallbackEnabled = new SettingState<boolean>(false);
  private autoCategorizationMode = new SettingState<AutoCategorizationMode>('initial');
  private chromeAIAvailable = new Signal.State(false);
  private mcpInstanceId = new SettingState<string>('');

  // Model fetching state
  @state() private geminiModels: string[] = [];
  @state() private openaiModels: string[] = [];
  @state() private openaiCustomModels: string[] = [];

  @state() private geminiLoading = false;
  @state() private openaiLoading = false;
  @state() private openaiCustomLoading = false;

  @state() private geminiError: string | null = null;
  @state() private openaiError: string | null = null;
  @state() private openaiCustomError: string | null = null;

  @state() private mcpEnabled = true;

  @state() private mcpStatus: ConnectionStatus = 'disconnected';
  @state() private mcpError: string | null = null;

  @query('sl-dialog') dialog!: SlDialog;
  @query('#mcp-enabled-switch') mcpEnabledSwitch!: SlSwitch;
  @query('sl-input[type="password"]') apiKeyInput!: SlInput;

  constructor() {
    super();
    this.checkChromeAIAvailability();
  }

  async checkChromeAIAvailability() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageTypes.CHECK_CHROME_AI_AVAILABILITY });
      this.chromeAIAvailable.set(!!response && response.success);
    } catch (_e) {
      this.chromeAIAvailable.set(false);
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('open-settings', this.handleOpenSettings);

    // Load settings
    const result = await chrome.storage.sync.get([
      'geminiApiKey',
      'geminiModelId',
      'openaiApiKey',
      'openaiModelId',
      'openaiCustomBaseUrl',
      'openaiCustomApiKey',
      'openaiCustomModelId',
      'predefined-groups',
      'active-llm-provider',
      'llm-strategy-override',
      'llm-fallback-enabled',
      'auto-categorization-mode',
      'mcp-instance-id',
    ]);

    if (result.geminiApiKey) {
      this.geminiApiKey.original.set(result.geminiApiKey as string);
      this.geminiApiKey.current.set('****************'); // Mask the key for display
    }
    if (result.geminiModelId) {
      this.geminiModelId.original.set(result.geminiModelId as string);
      this.geminiModelId.current.set(result.geminiModelId as string);
    }
    if (result.openaiApiKey) {
      this.openaiApiKey.original.set(result.openaiApiKey as string);
      this.openaiApiKey.current.set('****************'); // Mask the key for display
    }
    if (result.openaiModelId) {
      this.openaiModelId.original.set(result.openaiModelId as string);
      this.openaiModelId.current.set(result.openaiModelId as string);
    }

    if (result.openaiCustomBaseUrl) {
      this.openaiCustomBaseUrl.original.set(result.openaiCustomBaseUrl as string);
      this.openaiCustomBaseUrl.current.set(result.openaiCustomBaseUrl as string);
    }
    if (result.openaiCustomApiKey) {
      this.openaiCustomApiKey.original.set(result.openaiCustomApiKey as string);
      this.openaiCustomApiKey.current.set('****************'); // Mask the key for display
    }
    if (result.openaiCustomModelId) {
      this.openaiCustomModelId.original.set(result.openaiCustomModelId as string);
      this.openaiCustomModelId.current.set(result.openaiCustomModelId as string);
    }

    if (result['active-llm-provider']) {
      this.activeProvider.original.set(result['active-llm-provider'] as string);
      this.activeProvider.current.set(result['active-llm-provider'] as string);
    }
    if (result['llm-strategy-override']) {
      const override = result['llm-strategy-override'] as LLMStrategyType;
      this.strategyOverride.original.set(override);
      this.strategyOverride.current.set(override);
    }
    if (result['llm-fallback-enabled']) {
      this.fallbackEnabled.original.set(!!result['llm-fallback-enabled']);
      this.fallbackEnabled.current.set(!!result['llm-fallback-enabled']);
    }

    const mode = (result['auto-categorization-mode'] as AutoCategorizationMode) || 'initial';
    this.autoCategorizationMode.original.set(mode);
    this.autoCategorizationMode.current.set(mode);

    // Load Groups
    const groups = result['predefined-groups'] as string[] | undefined;
    if (groups && groups.length > 0) {
      this.predefinedGroups.original.set(groups.join(', '));
      this.predefinedGroups.current.set(groups.join(', '));
    } else {
      this.predefinedGroups.original.set('');
      this.predefinedGroups.current.set('');
    }

    // Load instance ID or fetch default
    let instanceId: string;
    const localResult = await chrome.storage.local.get('mcp-instance-id');

    if (localResult['mcp-instance-id']) {
      instanceId = localResult['mcp-instance-id'] as string;
    } else {
      try {
        const userInfo = await chrome.identity.getProfileUserInfo();
        instanceId = userInfo.email || 'default';
      } catch {
        instanceId = 'default';
      }
    }
    this.mcpInstanceId.original.set(instanceId);
    this.mcpInstanceId.current.set(instanceId);

    this.loadMcpSettings();
    this.startObservingMcp();

    // Fetch models if keys are present
    if (this.geminiApiKey.original.get()) this.fetchModels('gemini');
    if (this.openaiApiKey.original.get()) this.fetchModels('openai');
    if (this.openaiCustomBaseUrl.original.get()) this.fetchModels('openai-custom');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('open-settings', this.handleOpenSettings);
    chrome.storage.onChanged.removeListener(this.handleStorageChange);
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

  // Custom save for instance ID
  private async saveMcpInstanceId(id: string) {
    await chrome.storage.local.set({ 'mcp-instance-id': id });
  }

  // Generic render helper for text settings
  private renderStringSetting(
    label: string,
    setting: SettingState<string>,
    saveFn: (val: string) => Promise<void>,
    opts: {
      type?: 'text' | 'password';
      placeholder?: string;
      helpText?: string;
      id?: string;
      list?: string;
      loading?: boolean;
      error?: string | null;
      onRefresh?: () => void;
    } = {},
  ) {
    const { type = 'text', placeholder, helpText, id, list, loading, error, onRefresh } = opts;

    return html`
      <div class="setting-row">
        <sl-input
          class="setting-input"
          id=${id || ''}
          label=${label}
          type=${type}
          placeholder=${ifDefined(placeholder)}
          help-text=${ifDefined(helpText)}
          list=${ifDefined(list)}
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
        >
           ${error ? html`<sl-icon slot="suffix" name="exclamation-circle" style="color: var(--sl-color-danger-600);" title=${error}></sl-icon>` : ''}
        </sl-input>

        ${
          onRefresh
            ? html`
          <div class="setting-actions">
             ${
               loading
                 ? html`<sl-spinner style="font-size: var(--sl-font-size-large);"></sl-spinner>`
                 : html`<sl-icon-button name="arrow-clockwise" label="Refresh Models" @click=${onRefresh}></sl-icon-button>`
             }
          </div>
        `
            : ''
        }

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

  private renderStatus(setting: SettingState<unknown>) {
    return html`
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
    `;
  }

  private async saveApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await chrome.storage.sync.set({ geminiApiKey: trimmed });
      this.fetchModels('gemini');
    }
  }

  private async saveGeminiModelId(id: string) {
    await chrome.storage.sync.set({ geminiModelId: id });
  }

  private async saveOpenAIApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await chrome.storage.sync.set({ openaiApiKey: trimmed });
      this.fetchModels('openai');
    }
  }

  private async saveOpenAIModelId(id: string) {
    await chrome.storage.sync.set({ openaiModelId: id });
  }

  private async saveOpenAICustomBaseUrl(url: string) {
    await chrome.storage.sync.set({ openaiCustomBaseUrl: url });
    if (this.openaiCustomBaseUrl.current.get()) {
      this.fetchModels('openai-custom');
    }
  }

  private async saveOpenAICustomApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await chrome.storage.sync.set({ openaiCustomApiKey: trimmed });
      if (this.openaiCustomBaseUrl.current.get()) {
        this.fetchModels('openai-custom');
      }
    }
  }

  private async saveOpenAICustomModelId(id: string) {
    await chrome.storage.sync.set({ openaiCustomModelId: id });
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
  }

  private async fetchModels(provider: string) {
    let config: any = {};
    if (provider === 'gemini') {
      this.geminiLoading = true;
      this.geminiError = null;
      config = {
        geminiApiKey:
          this.geminiApiKey.current.get() === '****************'
            ? this.geminiApiKey.original.get()
            : this.geminiApiKey.current.get(),
      };
    } else if (provider === 'openai') {
      this.openaiLoading = true;
      this.openaiError = null;
      config = {
        openaiApiKey:
          this.openaiApiKey.current.get() === '****************'
            ? this.openaiApiKey.original.get()
            : this.openaiApiKey.current.get(),
      };
    } else if (provider === 'openai-custom') {
      this.openaiCustomLoading = true;
      this.openaiCustomError = null;
      config = {
        openaiCustomBaseUrl: this.openaiCustomBaseUrl.current.get(),
        openaiCustomApiKey:
          this.openaiCustomApiKey.current.get() === '****************'
            ? this.openaiCustomApiKey.original.get()
            : this.openaiCustomApiKey.current.get(),
      };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageTypes.FETCH_MODELS,
        provider,
        config,
      });

      if (response?.success) {
        if (provider === 'gemini') this.geminiModels = response.models;
        else if (provider === 'openai') this.openaiModels = response.models;
        else if (provider === 'openai-custom') this.openaiCustomModels = response.models;
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (provider === 'gemini') this.geminiError = msg;
      else if (provider === 'openai') this.openaiError = msg;
      else if (provider === 'openai-custom') this.openaiCustomError = msg;
    } finally {
      if (provider === 'gemini') this.geminiLoading = false;
      else if (provider === 'openai') this.openaiLoading = false;
      else if (provider === 'openai-custom') this.openaiCustomLoading = false;
    }
  }

  private handleRetryMcp() {
    chrome.runtime.sendMessage({ type: MessageTypes.MCP_RETRY });
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
        <div class="section-title">AI Provider</div>
        <div class="setting-row">
            <sl-select
                label="Active Provider"
                value=${this.activeProvider.current.get()}
                @sl-change=${(e: Event) => {
                  const val = (e.target as SlSelect).value as string;
                  this.activeProvider.update(val);
                  this.activeProvider.save(async (v) => {
                    await chrome.storage.sync.set({ 'active-llm-provider': v });
                  });
                }}
                class="setting-input"
            >
                <sl-option value="gemini">Gemini API</sl-option>
                <sl-option value="openai">OpenAI API</sl-option>
                <sl-option value="openai-custom">OpenAI (Custom)</sl-option>
                <sl-option value="chrome-ai" ?disabled=${!this.chromeAIAvailable.get()}>
                    Chrome Built-in AI ${!this.chromeAIAvailable.get() ? '(Not Available)' : ''}
                </sl-option>
            </sl-select>
             ${this.renderStatus(this.activeProvider)}
        </div>

        <div class="setting-row">
            <sl-select
                label="Strategy Mode"
                value=${this.strategyOverride.current.get()}
                @sl-change=${(e: Event) => {
                  const val = (e.target as SlSelect).value as LLMStrategyType;
                  this.strategyOverride.update(val);
                  this.strategyOverride.save(async (v) => {
                    await chrome.storage.sync.set({ 'llm-strategy-override': v });
                  });
                }}
                class="setting-input"
            >
                <sl-option value="default">Default</sl-option>
                <sl-option value="standard">Standard (Single Request)</sl-option>
                <sl-option value="batched">Batched (Multiple Requests)</sl-option>
            </sl-select>
             ${this.renderStatus(this.strategyOverride)}
        </div>

         <div class="setting-row">
            <sl-switch
                ?checked=${this.fallbackEnabled.current.get()}
                @sl-change=${(e: Event) => {
                  const checked = (e.target as SlSwitch).checked;
                  this.fallbackEnabled.update(checked);
                  this.fallbackEnabled.save(async (v) => {
                    await chrome.storage.sync.set({ 'llm-fallback-enabled': v });
                  });
                }}
            >
                Fallback to Chrome AI if Primary fails
            </sl-switch>
             ${this.renderStatus(this.fallbackEnabled)}
        </div>

        <div style="display: ${this.activeProvider.current.get() === 'gemini' ? 'block' : 'none'}">
          <div class="section-title">Gemini API</div>
          <p>Use Google's <a href="https://aistudio.google.com/app/api-keys">Gemini API</a> for powerful organization.</p>

            ${this.renderStringSetting('API Key', this.geminiApiKey, this.saveApiKey.bind(this), {
              type: 'password',
              placeholder: 'AIza...',
              id: 'api-key-input',
            })}

            ${this.renderStringSetting('Model ID', this.geminiModelId, this.saveGeminiModelId.bind(this), {
              placeholder: 'gemini-1.5-flash',
              id: 'gemini-model-input',
              list: 'gemini-models',
              loading: this.geminiLoading,
              error: this.geminiError,
              onRefresh: () => this.fetchModels('gemini'),
            })}
            <datalist id="gemini-models">
              ${this.geminiModels.map((m) => html`<option value=${m}></option>`)}
            </datalist>
        </div>

        <div style="display: ${this.activeProvider.current.get() === 'openai' ? 'block' : 'none'}">
          <div class="section-title">OpenAI API</div>
          <p>Use standard OpenAI services (requires API key).</p>

            ${this.renderStringSetting('API Key', this.openaiApiKey, this.saveOpenAIApiKey.bind(this), {
              type: 'password',
              placeholder: 'sk-...',
              id: 'openai-key-input',
            })}

            ${this.renderStringSetting('Model ID', this.openaiModelId, this.saveOpenAIModelId.bind(this), {
              placeholder: 'gpt-4o',
              id: 'openai-model-input',
              list: 'openai-models',
              loading: this.openaiLoading,
              error: this.openaiError,
              onRefresh: () => this.fetchModels('openai'),
            })}
            <datalist id="openai-models">
              ${this.openaiModels.map((m) => html`<option value=${m}></option>`)}
            </datalist>
        </div>

        <div style="display: ${this.activeProvider.current.get() === 'openai-custom' ? 'block' : 'none'}">
          <div class="section-title">OpenAI (Custom)</div>
          <p>Use local models (Ollama, LocalAI) or other OpenAI-compatible services.</p>

            ${this.renderStringSetting('Base URL', this.openaiCustomBaseUrl, this.saveOpenAICustomBaseUrl.bind(this), {
              placeholder: 'http://localhost:11434/v1',
              id: 'openai-custom-url-input',
            })}

            ${this.renderStringSetting('API Key', this.openaiCustomApiKey, this.saveOpenAICustomApiKey.bind(this), {
              type: 'password',
              placeholder: 'sk-...',
              id: 'openai-custom-key-input',
              helpText: 'Not needed for most local services',
            })}

            ${this.renderStringSetting('Model ID', this.openaiCustomModelId, this.saveOpenAICustomModelId.bind(this), {
              placeholder: 'gpt-4o or llama3',
              id: 'openai-custom-model-input',
              list: 'openai-custom-models',
              loading: this.openaiCustomLoading,
              error: this.openaiCustomError,
              onRefresh: () => this.fetchModels('openai-custom'),
            })}
            <datalist id="openai-custom-models">
              ${this.openaiCustomModels.map((m) => html`<option value=${m}></option>`)}
            </datalist>
        </div>

        <div class="section-title">General AI Settings</div>

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

          <div class="setting-row">
            <sl-select
                label="Auto-Categorization Mode"
                value=${this.autoCategorizationMode.current.get()}
                @sl-change=${(e: Event) => {
                  const val = (e.target as SlSelect).value as AutoCategorizationMode;
                  this.autoCategorizationMode.update(val);
                  this.autoCategorizationMode.save(async (v) => {
                    await chrome.storage.sync.set({ 'auto-categorization-mode': v });
                  });
                }}
                class="setting-input"
            >
                <sl-option value="off">Off</sl-option>
                <sl-option value="initial">Initial (New Tabs Only)</sl-option>
                <sl-option value="always">Always (On Navigation)</sl-option>
            </sl-select>
             ${this.renderStatus(this.autoCategorizationMode)}
          </div>

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

           ${this.renderStringSetting('Instance ID', this.mcpInstanceId, this.saveMcpInstanceId.bind(this), {
             placeholder: 'default',
             id: 'mcp-instance-id-input',
             helpText: 'Unique ID for this browser profile (defaults to email)',
           })}

          ${this.mcpError ? html`<div style="color: var(--sl-color-danger-600); font-size: var(--sl-font-size-small);">${this.mcpError}</div>` : ''}

        </div>
        <div slot="footer">
          <sl-button variant="default" @click=${this.handleClose}>Close</sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
