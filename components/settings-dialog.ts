import { SignalWatcher } from '@lit-labs/signals';
import { css, html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { ConnectionStatus } from '../services/mcp/mcp-connection.js';
import type { AutoCategorizationMode, LLMProvider, LLMStrategyType, ProviderSetting } from '../types/llm-types.js';
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
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import type { SlDialog, SlInput, SlSelect, SlSwitch } from '@shoelace-style/shoelace';
import { ifDefined } from 'lit/directives/if-defined.js';
import { Signal } from 'signal-polyfill';
import { StorageKeys } from '../utils/storage-keys.js';

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
        font-size: var(--sl-font-size-small);
        font-weight: var(--sl-font-weight-semibold);
        color: var(--sl-color-neutral-600);
        text-transform: uppercase;
        letter-spacing: var(--sl-letter-spacing-loose);
        margin-bottom: var(--sl-spacing-x-small);
        margin-top: var(--sl-spacing-large);
    }

    .section-title:first-child {
        margin-top: 0;
    }

    sl-card {
        width: 100%;
        border: 1px solid var(--sl-color-neutral-200);
        box-shadow: none; /* Shoelace cards have shadow by default, maybe flat is better? keeping default for now or making flat per user preference if implied. User said "visually organize", cards usually imply containment. */
    }

    sl-card::part(base) {
        border: 1px solid var(--sl-color-neutral-200);
        box-shadow: none;
    }

    sl-card::part(header) {
        display: none; /* Hide header if not used, or just don't populate it */
    }

    sl-card::part(body) {
        padding: var(--sl-spacing-medium);
        display: flex;
        flex-direction: column;
        gap: var(--sl-spacing-medium);
    }

    .status-row {
        display: flex;
        align-items: center;
        gap: var(--sl-spacing-medium);
        justify-content: space-between;
    }

    /* ... rest of existing styles ... */

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

    /* Provider Accordion Styles */
    .provider-list {
        display: flex;
        flex-direction: column;
        gap: var(--sl-spacing-small);
    }

    .provider-wrapper {
        transition: opacity 0.2s;
    }

    .provider-wrapper.dragging {
        opacity: 0.5;
    }

    /* Customizing sl-details to look integrated */
    .provider-details {
        border: 1px solid var(--sl-color-neutral-200);
        border-radius: var(--sl-border-radius-medium);
        overflow: hidden;
        background: var(--sl-color-neutral-0);
    }

    .provider-details::part(base) {
        border: none;
    }

    .provider-details::part(header) {
        background: var(--sl-color-neutral-50);
    }

    .provider-details::part(header):hover {
        background: var(--sl-color-neutral-100);
    }

    .provider-details::part(content) {
        padding: 0;
        border-top: 1px solid var(--sl-color-neutral-200);
    }

    /* Using slot="summary" allows full control of the header layout */
    .provider-summary {
        display: flex;
        align-items: center;
        gap: var(--sl-spacing-small);
        width: 100%;
    }

    .drag-handle {
        color: var(--sl-color-neutral-400);
        cursor: grab;
        display: flex;
        align-items: center;
    }

    .drag-handle:active {
        cursor: grabbing;
    }

    .provider-name {
        flex: 1;
        font-weight: var(--sl-font-weight-semibold);
        color: var(--sl-color-neutral-700);
    }

    .provider-controls {
        display: flex;
        align-items: center;
        gap: var(--sl-spacing-x-small);
    }

    /* Hide default toggle icon since we might want our own or rely on valid details behavior?
       Actually sl-details puts a chevron on the right by default.
       Let's hide the default one if we want a custom look, or keep it.
       The user wants 'accordion', standard sl-details has a chevron.
       We can hide it if we want to clean up the right side or just let it be.
       Let's keep it but ensure it doesn't conflict with our switch.
    */
    .provider-details::part(summary-icon) {
        margin-left: var(--sl-spacing-small);
    }

    .provider-content-wrapper {
        padding: var(--sl-spacing-medium);
        display: flex;
        flex-direction: column;
        gap: var(--sl-spacing-small);
    }

    .sort-buttons {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .sort-btn {
        font-size: 16px;
        color: var(--sl-color-neutral-500);
        padding: 0;
        margin: 0;
        line-height: 0.8;
    }

    .sort-btn::part(base) {
        padding: 0;
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

  // New Provider Order State
  private providerOrder = new SettingState<ProviderSetting[]>([]);

  private strategyOverride = new SettingState<LLMStrategyType>('default');
  private autoCategorizationMode = new SettingState<AutoCategorizationMode>('initial');
  private chromeAIAvailable = new Signal.State(false);
  private mcpInstanceId = new SettingState<string>('');

  // UI State for expansion
  @state() private expandedProviders: Set<string> = new Set();

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

  // Drag and drop state
  @state() private draggingIndex: number | null = null;

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
      StorageKeys.Sync.GEMINI_API_KEY,
      StorageKeys.Sync.GEMINI_MODEL_ID,
      StorageKeys.Sync.OPENAI_API_KEY,
      StorageKeys.Sync.OPENAI_MODEL_ID,
      StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL,
      StorageKeys.Sync.OPENAI_CUSTOM_API_KEY,
      StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID,
      StorageKeys.Sync.PREDEFINED_GROUPS,
      StorageKeys.Sync.PROVIDER_ORDER,
      StorageKeys.Sync.LLM_STRATEGY_OVERRIDE,
      StorageKeys.Sync.AUTO_CATEGORIZATION_MODE,
      StorageKeys.Local.MCP_INSTANCE_ID,
    ]);

    if (result[StorageKeys.Sync.GEMINI_API_KEY]) {
      this.geminiApiKey.original.set(result[StorageKeys.Sync.GEMINI_API_KEY] as string);
      this.geminiApiKey.current.set('****************'); // Mask the key for display
    }
    if (result[StorageKeys.Sync.GEMINI_MODEL_ID]) {
      this.geminiModelId.original.set(result[StorageKeys.Sync.GEMINI_MODEL_ID] as string);
      this.geminiModelId.current.set(result[StorageKeys.Sync.GEMINI_MODEL_ID] as string);
    }
    if (result[StorageKeys.Sync.OPENAI_API_KEY]) {
      this.openaiApiKey.original.set(result[StorageKeys.Sync.OPENAI_API_KEY] as string);
      this.openaiApiKey.current.set('****************'); // Mask the key for display
    }
    if (result[StorageKeys.Sync.OPENAI_MODEL_ID]) {
      this.openaiModelId.original.set(result[StorageKeys.Sync.OPENAI_MODEL_ID] as string);
      this.openaiModelId.current.set(result[StorageKeys.Sync.OPENAI_MODEL_ID] as string);
    }

    if (result[StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL]) {
      this.openaiCustomBaseUrl.original.set(result[StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL] as string);
      this.openaiCustomBaseUrl.current.set(result[StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL] as string);
    }
    if (result[StorageKeys.Sync.OPENAI_CUSTOM_API_KEY]) {
      this.openaiCustomApiKey.original.set(result[StorageKeys.Sync.OPENAI_CUSTOM_API_KEY] as string);
      this.openaiCustomApiKey.current.set('****************'); // Mask the key for display
    }
    if (result[StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID]) {
      this.openaiCustomModelId.original.set(result[StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID] as string);
      this.openaiCustomModelId.current.set(result[StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID] as string);
    }

    if (result[StorageKeys.Sync.PROVIDER_ORDER]) {
      const order = result[StorageKeys.Sync.PROVIDER_ORDER] as ProviderSetting[];
      this.providerOrder.original.set(order);
      this.providerOrder.current.set(order);
    } else {
      // Fallback default if not yet initialized/migrated (though LLMManager handles migration)
      const defaultOrder: ProviderSetting[] = [
        { id: 'gemini', enabled: true },
        { id: 'openai', enabled: false },
        { id: 'openai-custom', enabled: false },
        { id: 'chrome-ai', enabled: false },
      ];
      this.providerOrder.original.set(defaultOrder);
      this.providerOrder.current.set(defaultOrder);
    }

    if (result[StorageKeys.Sync.LLM_STRATEGY_OVERRIDE]) {
      const override = result[StorageKeys.Sync.LLM_STRATEGY_OVERRIDE] as LLMStrategyType;
      this.strategyOverride.original.set(override);
      this.strategyOverride.current.set(override);
    }

    const mode = (result[StorageKeys.Sync.AUTO_CATEGORIZATION_MODE] as AutoCategorizationMode) || 'initial';
    this.autoCategorizationMode.original.set(mode);
    this.autoCategorizationMode.current.set(mode);

    // Load Groups
    const groups = result[StorageKeys.Sync.PREDEFINED_GROUPS] as string[] | undefined;
    if (groups && groups.length > 0) {
      this.predefinedGroups.original.set(groups.join(', '));
      this.predefinedGroups.current.set(groups.join(', '));
    } else {
      this.predefinedGroups.original.set('');
      this.predefinedGroups.current.set('');
    }

    // Load instance ID or fetch default
    let instanceId: string;
    const localResult = await chrome.storage.local.get(StorageKeys.Local.MCP_INSTANCE_ID);

    if (localResult[StorageKeys.Local.MCP_INSTANCE_ID]) {
      instanceId = localResult[StorageKeys.Local.MCP_INSTANCE_ID] as string;
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
    const result = await chrome.storage.sync.get(StorageKeys.Sync.MCP_ENABLED);
    this.mcpEnabled = result[StorageKeys.Sync.MCP_ENABLED] !== false; // Default to true
  }

  private async startObservingMcp() {
    // Initial fetch
    const session = await chrome.storage.session.get([StorageKeys.Session.MCP_STATUS, StorageKeys.Session.MCP_ERROR]);
    if (session[StorageKeys.Session.MCP_STATUS])
      this.mcpStatus = session[StorageKeys.Session.MCP_STATUS] as ConnectionStatus;
    if (session[StorageKeys.Session.MCP_ERROR]) this.mcpError = session[StorageKeys.Session.MCP_ERROR] as string;

    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'session') {
      if (changes[StorageKeys.Session.MCP_STATUS]) {
        this.mcpStatus = changes[StorageKeys.Session.MCP_STATUS].newValue as ConnectionStatus;
      }
      if (changes[StorageKeys.Session.MCP_ERROR]) {
        this.mcpError = changes[StorageKeys.Session.MCP_ERROR].newValue as string | null;
      }
    }
    // Update provider order if changed externally
    if (areaName === 'sync' && changes[StorageKeys.Sync.PROVIDER_ORDER]) {
      const newOrder = changes[StorageKeys.Sync.PROVIDER_ORDER].newValue as ProviderSetting[];
      this.providerOrder.original.set(newOrder);
      this.providerOrder.current.set(newOrder);
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
    await chrome.storage.local.set({ [StorageKeys.Local.MCP_INSTANCE_ID]: id });
  }

  private async saveProviderOrder(order: ProviderSetting[]) {
    await chrome.storage.sync.set({ [StorageKeys.Sync.PROVIDER_ORDER]: order });
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
      await chrome.storage.sync.set({ [StorageKeys.Sync.GEMINI_API_KEY]: trimmed });
      this.fetchModels('gemini');
    }
  }

  private async saveGeminiModelId(id: string) {
    await chrome.storage.sync.set({ [StorageKeys.Sync.GEMINI_MODEL_ID]: id });
  }

  private async saveOpenAIApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await chrome.storage.sync.set({ [StorageKeys.Sync.OPENAI_API_KEY]: trimmed });
      this.fetchModels('openai');
    }
  }

  private async saveOpenAIModelId(id: string) {
    await chrome.storage.sync.set({ [StorageKeys.Sync.OPENAI_MODEL_ID]: id });
  }

  private async saveOpenAICustomBaseUrl(url: string) {
    await chrome.storage.sync.set({ [StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL]: url });
    if (this.openaiCustomBaseUrl.current.get()) {
      this.fetchModels('openai-custom');
    }
  }

  private async saveOpenAICustomApiKey(key: string) {
    const trimmed = key.trim();
    if (trimmed && trimmed !== '****************') {
      await chrome.storage.sync.set({ [StorageKeys.Sync.OPENAI_CUSTOM_API_KEY]: trimmed });
      if (this.openaiCustomBaseUrl.current.get()) {
        this.fetchModels('openai-custom');
      }
    }
  }

  private async saveOpenAICustomModelId(id: string) {
    await chrome.storage.sync.set({ [StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID]: id });
  }

  private async savePredefinedGroups(groupsText: string) {
    const groups = groupsText
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    await chrome.storage.sync.set({ [StorageKeys.Sync.PREDEFINED_GROUPS]: groups });
  }

  private async toggleMcp(e: CustomEvent) {
    const enabled = (e.target as SlSwitch).checked;
    this.mcpEnabled = enabled;
    await chrome.storage.sync.set({ [StorageKeys.Sync.MCP_ENABLED]: enabled });
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

  // Provider List Helpers

  private toggleProviderExpanded(id: string, isOpen: boolean) {
    const newSet = new Set(this.expandedProviders);
    if (!isOpen) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    this.expandedProviders = newSet;
  }

  private async toggleProviderEnabled(id: LLMProvider, enabled: boolean) {
    const currentOrder = [...this.providerOrder.current.get()];
    const index = currentOrder.findIndex((p) => p.id === id);
    if (index > -1) {
      currentOrder[index] = { ...currentOrder[index], enabled };
      this.providerOrder.update(currentOrder);
      await this.providerOrder.save(this.saveProviderOrder.bind(this));
    }
  }

  private moveProvider(index: number, direction: 'up' | 'down') {
    const currentOrder = [...this.providerOrder.current.get()];
    if (direction === 'up' && index > 0) {
      [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]];
    } else if (direction === 'down' && index < currentOrder.length - 1) {
      [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
    } else {
      return;
    }

    this.providerOrder.update(currentOrder);
    this.providerOrder.save(this.saveProviderOrder.bind(this));
  }

  // Drag and Drop Handlers
  private handleDragStart(e: DragEvent, index: number) {
    this.draggingIndex = index;
    e.dataTransfer!.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer!.setData('text/plain', String(index));
    (e.target as HTMLElement).classList.add('dragging');
  }

  private handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (this.draggingIndex === null || this.draggingIndex === index) return;

    const currentOrder = [...this.providerOrder.current.get()];
    const draggedItem = currentOrder[this.draggingIndex];

    // Remove from old index
    currentOrder.splice(this.draggingIndex, 1);
    // Insert at new index
    currentOrder.splice(index, 0, draggedItem);

    this.providerOrder.update(currentOrder);
    this.draggingIndex = index;
  }

  private handleDragEnd(e: DragEvent) {
    this.draggingIndex = null;
    (e.target as HTMLElement).classList.remove('dragging');
    this.providerOrder.save(this.saveProviderOrder.bind(this));
  }

  private getProviderName(id: LLMProvider) {
    switch (id) {
      case 'gemini':
        return 'Google Gemini';
      case 'openai':
        return 'OpenAI';
      case 'openai-custom':
        return 'OpenAI Compatible (Local)';
      case 'chrome-ai':
        return 'Chrome Built-in AI';
      default:
        return id;
    }
  }

  private renderProviderContent(id: LLMProvider) {
    switch (id) {
      case 'gemini':
        return html`
                <p>Uses the <a href="https://aistudio.google.com/app/api-keys" target="_blank">Gemini API</a></p>
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
              `;
      case 'openai':
        return html`
                <p>Uses the standard <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API</a></p>
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
              `;
      case 'openai-custom':
        return html`
                   <p>Use local models (Ollama, LocalAI) or other OpenAI-compatible services.</p>
                    ${this.renderStringSetting(
                      'Base URL',
                      this.openaiCustomBaseUrl,
                      this.saveOpenAICustomBaseUrl.bind(this),
                      {
                        placeholder: 'http://localhost:11434/v1',
                        id: 'openai-custom-url-input',
                      },
                    )}
                    ${this.renderStringSetting(
                      'API Key',
                      this.openaiCustomApiKey,
                      this.saveOpenAICustomApiKey.bind(this),
                      {
                        type: 'password',
                        placeholder: 'sk-...',
                        id: 'openai-custom-key-input',
                        helpText: 'Not needed for most local services',
                      },
                    )}
                    ${this.renderStringSetting(
                      'Model ID',
                      this.openaiCustomModelId,
                      this.saveOpenAICustomModelId.bind(this),
                      {
                        placeholder: 'gpt-4o or llama3',
                        id: 'openai-custom-model-input',
                        list: 'openai-custom-models',
                        loading: this.openaiCustomLoading,
                        error: this.openaiCustomError,
                        onRefresh: () => this.fetchModels('openai-custom'),
                      },
                    )}
                    <datalist id="openai-custom-models">
                        ${this.openaiCustomModels.map((m) => html`<option value=${m}></option>`)}
                    </datalist>
                `;
      case 'chrome-ai':
        return html`
                    <p>Uses the experimental Chrome Built-in AI (Gemini Nano).</p>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        Status:
                        ${
                          this.chromeAIAvailable.get()
                            ? html`<sl-badge variant="success">Available</sl-badge>`
                            : html`<sl-badge variant="danger">Not Available</sl-badge>`
                        }
                    </div>
                `;
      default:
        return html`Unknown Provider`;
    }
  }

  render() {
    return html`
      <sl-dialog label="Settings" ?open=${this.open} @sl-after-hide=${(e: Event) => {
        if (e.target === e.currentTarget) {
          this.open = false;
        }
      }}>
        <div class="content">
        <div class="section-title">AI Providers</div>
        <p style="font-size: var(--sl-font-size-small); color: var(--sl-color-neutral-500); margin-top: -8px;">
            Drag to reorder. If multiple providers are enabled, secondary providers will be used as fallbacks.
        </p>

        <div class="provider-list">
            ${this.providerOrder.current.get().map(
              (provider, index) => html`
                <div
                    class="provider-wrapper ${this.draggingIndex === index ? 'dragging' : ''}"
                    draggable="true"
                    @dragstart=${(e: DragEvent) => this.handleDragStart(e, index)}
                    @dragover=${(e: DragEvent) => this.handleDragOver(e, index)}
                    @dragend=${this.handleDragEnd}
                >
                    <sl-details
                        ?open=${this.expandedProviders.has(provider.id)}
                        @sl-show=${() => this.toggleProviderExpanded(provider.id, true)}
                        @sl-hide=${() => this.toggleProviderExpanded(provider.id, false)}
                        class="provider-details"
                    >
                        <div slot="summary" class="provider-summary">
                            <div class="drag-handle" @mousedown=${(e: Event) => e.stopPropagation()}>
                                <sl-icon name="grip-vertical"></sl-icon>
                            </div>
                            <div class="sort-buttons">
                                <sl-icon-button
                                    name="chevron-up"
                                    class="sort-btn"
                                    ?disabled=${index === 0}
                                    @click=${(e: Event) => {
                                      e.stopPropagation(); // Prevent toggling details
                                      this.moveProvider(index, 'up');
                                    }}
                                ></sl-icon-button>
                                <sl-icon-button
                                    name="chevron-down"
                                    class="sort-btn"
                                    ?disabled=${index === this.providerOrder.current.get().length - 1}
                                    @click=${(e: Event) => {
                                      e.stopPropagation(); // Prevent toggling details
                                      this.moveProvider(index, 'down');
                                    }}
                                ></sl-icon-button>
                            </div>
                            <div class="provider-name">
                                ${this.getProviderName(provider.id)}
                            </div>
                            <div class="provider-controls" @click=${(e: Event) => e.stopPropagation()}>
                                <sl-switch
                                    ?checked=${provider.enabled}
                                    @sl-change=${(e: Event) => this.toggleProviderEnabled(provider.id, (e.target as SlSwitch).checked)}
                                ></sl-switch>
                            </div>
                        </div>
                        <div class="provider-content-wrapper">
                            ${this.renderProviderContent(provider.id)}
                        </div>
                    </sl-details>
                </div>
            `,
            )}
        </div>

        <div class="divider"></div>

        <div class="divider"></div>

        <div class="section-title">General AI Settings</div>

        <sl-card>
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
        </sl-card>

        <div class="section-title">MCP Server</div>

        <sl-card>
            <p style="margin-top: 0; font-size: var(--sl-font-size-small); color: var(--sl-color-neutral-500);">
                Expose tab manipulation to LLMs via local MCP server (requires helper script).
            </p>

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
        </sl-card>

        </div>
        <div slot="footer">
          <sl-button variant="default" @click=${this.handleClose}>Close</sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
