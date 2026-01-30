import type { JsonSchema, LLMService, TabData } from '../../types/llm-types';
import { CategorizationSchema, SimilaritySchema, WindowNameSchema } from '../../utils/ai-schemas';
import { MessageTypes } from '../../utils/message-types';

interface ChromeAIResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export class ChromeAIService implements LLMService {
  private batchSize = 5; // Default batch size

  constructor(batchSize?: number) {
    if (batchSize) this.batchSize = batchSize;
  }

  async isAvailable(): Promise<boolean> {
    // We check availability via the offscreen document
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MessageTypes.CHECK_CHROME_AI_AVAILABILITY,
      })) as ChromeAIResponse;
      return response.success;
    } catch (e) {
      console.warn('Chrome AI availability check failed:', e);
      return false;
    }
  }

  private async promptProxy(prompt: string, systemPrompt?: string, schema?: JsonSchema): Promise<string> {
    const response = (await chrome.runtime.sendMessage({
      type: MessageTypes.EXECUTE_AI_PROMPT,
      prompt,
      systemPrompt,
      schema,
    })) as ChromeAIResponse;

    if (!response.success || !response.text) {
      throw new Error(response.error || 'Unknown Chrome AI Error');
    }
    return response.text;
  }

  async categorizeTabs(tabs: TabData[], existingGroups: string[]): Promise<Map<number, string[]>> {
    const resultMap = new Map<number, string[]>();

    // Batch processing
    for (let i = 0; i < tabs.length; i += this.batchSize) {
      const batch = tabs.slice(i, i + this.batchSize);
      try {
        const batchResults = await this.categorizeBatch(batch, existingGroups);
        for (const [id, groups] of batchResults) {
          resultMap.set(id, groups);
        }
      } catch (e) {
        console.error(`Failed to categorize batch ${i}-${i + this.batchSize}:`, e);
        // Continue with other batches even if one fails
      }
    }

    return resultMap;
  }

  private async categorizeBatch(tabs: TabData[], allGroups: string[]): Promise<Map<number, string[]>> {
    const prompt = `
      Input Tabs:
      ${JSON.stringify(tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })))}

      Existing Groups: ${JSON.stringify(allGroups)}
    `;

    const systemPrompt = `
      You are a browser tab organizer.
      Rules:
      1. Suggest 1-3 concise group names for each tab.
      2. Reuse existing groups if possible.
      3. Return ONLY a JSON object with a "suggestions" array.
      4. Format: { "suggestions": [{ "tabId": 123, "groupNames": ["Dev", "Work"] }] }
    `;

    const schema = CategorizationSchema;

    try {
      const responseText = await this.promptProxy(prompt, systemPrompt, schema);
      const parsed = JSON.parse(responseText || '{}');
      const suggestions = parsed.suggestions || [];

      const map = new Map<number, string[]>();
      for (const item of suggestions) {
        if (item.tabId && Array.isArray(item.groupNames)) {
          map.set(Number(item.tabId), item.groupNames);
        }
      }
      return map;
    } catch (e) {
      console.error('Chrome AI Categorization Error:', e);
      throw e;
    }
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    const prompt = `
      Reference Tab: { "title": "${referenceTab.title}", "url": "${referenceTab.url}" }
      Candidates: ${JSON.stringify(candidateTabs.map((t) => ({ id: t.id, title: t.title, url: t.url })))}
    `;

    const systemPrompt = `
      Identify candidates similar to the reference (topic/domain/task).
      Return ONLY JSON: { "similarTabIds": [1, 2, 3] }
    `;

    const schema = SimilaritySchema;

    try {
      const responseText = await this.promptProxy(prompt, systemPrompt, schema);
      const parsed = JSON.parse(responseText);
      return parsed.similarTabIds || [];
    } catch (e) {
      console.error('Chrome AI Similarity Error:', e);
      return [];
    }
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    const prompt = `
      Tabs: ${JSON.stringify(tabs.map((t) => ({ title: t.title, url: t.url })))}
      Groups: ${JSON.stringify(groups)}
      `;

    const systemPrompt = `
      Suggest a short (1-3 words) window name.
      Return ONLY JSON: { "windowName": "Research" }
      `;

    const schema = WindowNameSchema;

    try {
      const responseText = await this.promptProxy(prompt, systemPrompt, schema);
      const parsed = JSON.parse(responseText);
      return parsed.windowName || '';
    } catch (e) {
      console.error('Chrome AI Window Naming Error:', e);
      return '';
    }
  }
}

export const chromeAIService = new ChromeAIService();
