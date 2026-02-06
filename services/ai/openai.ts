import OpenAI from 'openai';
import type { LLMService, TabData } from '../../types/llm-types';

export class OpenAIService implements LLMService {
  private apiKey: string | null = null;
  private baseURL: string = 'https://api.openai.com/v1';
  private model: string = 'gpt-4o';

  constructor() {
    this.loadSettings();
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(['openaiApiKey', 'openaiBaseUrl', 'openaiModel']);
    this.apiKey = result.openaiApiKey as string;
    this.baseURL = (result.openaiBaseUrl as string) || 'https://api.openai.com/v1';
    this.model = (result.openaiModel as string) || 'gpt-4o';
  }

  async updateSettings(apiKey: string, baseURL: string, model: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
    await chrome.storage.sync.set({
      openaiApiKey: apiKey,
      openaiBaseUrl: baseURL,
      openaiModel: model,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      await this.loadSettings();
    }
    return !!this.apiKey;
  }

  private getClient(): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey!,
      baseURL: this.baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  async categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>> {
    const available = await this.isAvailable();
    if (!available || !this.apiKey) {
      throw new Error('API Key not set');
    }

    // Load predefined groups from settings
    const result = await chrome.storage.sync.get('predefined-groups');
    const predefinedGroups = (result['predefined-groups'] as string[]) || [];

    // Merge predefined groups with existing groups (remove duplicates)
    const allGroups = Array.from(new Set([...predefinedGroups, ...existingGroups]));

    const client = this.getClient();

    const prompt = `
      You are a helpful assistant that organizes browser tabs.

      Here is a list of tabs:
      ${tabs.map((t) => `- ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Here is a list of existing tab groups:
      ${allGroups.join(', ')}

      For each tab, suggest up to 3 group names.
      Prefer using existing group names if they fit well.
      If no existing group fits, create a new short, descriptive group name (e.g., "Dev", "News", "Social").

      You must respond with valid JSON matching this structure:
      {
        "suggestions": [
          { "tabId": 123, "groupNames": ["Group1", "Group2"] }
        ]
      }
    `;

    try {
      const completion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      const parsed = JSON.parse(responseText || '{}');
      const suggestions = parsed.suggestions || [];

      const resultMap = new Map<number, string[]>();
      for (const item of suggestions) {
        resultMap.set(Number(item.tabId), item.groupNames);
      }
      if (onProgress) {
        onProgress(resultMap);
      }
      return resultMap;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    const available = await this.isAvailable();
    if (!available || !this.apiKey) {
      throw new Error('API Key not set');
    }

    const client = this.getClient();

    const prompt = `
      You are a helpful assistant that identifies similar browser tabs.

      Reference Tab:
      - Title: "${referenceTab.title}"
      - URL: "${referenceTab.url}"

      Candidate Tabs:
      ${candidateTabs.map((t) => `- ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Identify which candidate tabs are similar to the Reference Tab based on:
      1. Same Domain/Website
      2. Same Task (e.g., both are about booking a flight, even if different sites)
      3. Same Topic (e.g., both are about Python programming)

      You must respond with valid JSON matching this structure:
      {
        "similarTabIds": [123, 456]
      }
    `;

    try {
      const completion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      const parsed = JSON.parse(responseText || '{}');
      return parsed.similarTabIds || [];
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    const available = await this.isAvailable();
    if (!available || !this.apiKey) {
      throw new Error('API Key not set');
    }

    const client = this.getClient();

    const prompt = `
      You are a helpful assistant that names browser windows.

      Here is the content of the window:

      Tabs:
      ${tabs.map((t) => `- Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Tab Groups:
      ${groups.join(', ')}

      Suggest a short, descriptive name for this window based on its content (e.g., "Work", "Research", "Shopping", "Dev").
      The name should be concise (1-3 words).

      You must respond with valid JSON matching this structure:
      {
        "windowName": "My Window"
      }
    `;

    try {
      const completion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      const parsed = JSON.parse(responseText || '{}');
      return parsed.windowName || '';
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }
}

export const openAIService = new OpenAIService();
