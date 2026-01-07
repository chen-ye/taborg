import { GoogleGenAI } from '@google/genai';

export class GeminiService {
  private apiKey: string | null = null;

  constructor() {
    this.loadApiKey();
  }

  async loadApiKey() {
    const result = await chrome.storage.sync.get('geminiApiKey');
    this.apiKey = result.geminiApiKey as string;
  }

  async setApiKey(key: string) {
    this.apiKey = key;
    await chrome.storage.sync.set({ geminiApiKey: key });
  }

  async categorizeTabs(tabs: { title: string; url: string; id: number }[], existingGroups: string[]): Promise<Map<number, string[]>> {
    if (!this.apiKey) {
      throw new Error('API Key not set');
    }

    // Load predefined groups from settings
    const result = await chrome.storage.sync.get('predefined-groups');
    const predefinedGroups = (result['predefined-groups'] as string[]) || [];

    // Merge predefined groups with existing groups (remove duplicates)
    const allGroups = Array.from(new Set([...predefinedGroups, ...existingGroups]));

    const genAI = new GoogleGenAI({ apiKey: this.apiKey });

    const prompt = `
      You are a helpful assistant that organizes browser tabs.

      Here is a list of tabs:
      ${tabs.map(t => `- ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Here is a list of existing tab groups:
      ${allGroups.join(', ')}

      For each tab, suggest up to 3 group names.
      Prefer using existing group names if they fit well.
      If no existing group fits, create a new short, descriptive group name (e.g., "Dev", "News", "Social").
    `;

    const schema = {
      type: "OBJECT",
      properties: {
        suggestions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              tabId: { type: "INTEGER" },
              groupNames: {
                type: "ARRAY",
                items: { type: "STRING" }
              }
            },
            required: ["tabId", "groupNames"]
          }
        }
      },
      required: ["suggestions"]
    };

    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-robotics-er-1.5-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const responseText = result.text;
      const parsed = JSON.parse(responseText || '{}');
      const suggestions = parsed.suggestions || [];

      const resultMap = new Map<number, string[]>();
      for (const item of suggestions) {
        resultMap.set(Number(item.tabId), item.groupNames);
      }
      return resultMap;

    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }

  async findSimilarTabs(referenceTab: { title: string; url: string }, candidateTabs: { id: number; title: string; url: string }[]): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('API Key not set');
    }

    const genAI = new GoogleGenAI({ apiKey: this.apiKey });

    const prompt = `
      You are a helpful assistant that identifies similar browser tabs.

      Reference Tab:
      - Title: "${referenceTab.title}"
      - URL: "${referenceTab.url}"

      Candidate Tabs:
      ${candidateTabs.map(t => `- ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Identify which candidate tabs are similar to the Reference Tab based on:
      1. Same Domain/Website
      2. Same Task (e.g., both are about booking a flight, even if different sites)
      3. Same Topic (e.g., both are about Python programming)
    `;

    const schema = {
      type: "OBJECT",
      properties: {
        similarTabIds: {
          type: "ARRAY",
          items: { type: "INTEGER" }
        }
      },
      required: ["similarTabIds"]
    };

    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-robotics-er-1.5-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const responseText = result.text;
      const parsed = JSON.parse(responseText || '{}');
      return parsed.similarTabIds || [];
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }

  async generateWindowName(tabs: { title: string; url: string }[], groups: string[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API Key not set');
    }

    const genAI = new GoogleGenAI({ apiKey: this.apiKey });

    const prompt = `
      You are a helpful assistant that names browser windows.

      Here is the content of the window:

      Tabs:
      ${tabs.map(t => `- Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Tab Groups:
      ${groups.join(', ')}

      Suggest a short, descriptive name for this window based on its content (e.g., "Work", "Research", "Shopping", "Dev").
      The name should be concise (1-3 words).
    `;

    const schema = {
      type: "OBJECT",
      properties: {
        windowName: { type: "STRING" }
      },
      required: ["windowName"]
    };

    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-robotics-er-1.5-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });

      const responseText = result.text;
      const parsed = JSON.parse(responseText || '{}');
      return parsed.windowName || '';
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
