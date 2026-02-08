import { generateText, type LanguageModel, Output } from 'ai';
import type { LLMService, TabData } from '../../types/llm-types';
import { CategorizationSchemaType, SimilaritySchemaType, WindowNameSchemaType } from '../../utils/ai-schemas';

/**
 * Standard strategy for robust LLMs (Gemini Pro, GPT-4, etc.)
 * Sends all data in a single request for maximum context.
 */
export class StandardLLMStrategy implements LLMService {
  constructor(private model: LanguageModel) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>> {
    // Load predefined groups from settings (mimicking existing behavior)
    const result = await chrome.storage.sync.get('predefined-groups');
    const predefinedGroups = (result['predefined-groups'] as string[]) || [];
    const allGroups = Array.from(new Set([...predefinedGroups, ...existingGroups]));

    const { output } = await generateText({
      model: this.model,
      output: Output.object({ schema: CategorizationSchemaType }),
      prompt: `
        You are a helpful assistant that organizes browser tabs.

        Input Tabs:
        ${JSON.stringify(tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })))}

        Here is a list of existing tab groups:
        ${allGroups.join(', ')}

        For each tab, suggest up to 3 group names.
        Prefer using existing group names if they fit well.
        If no existing group fits, create a new short, descriptive group name (e.g., "Dev", "News", "Social").
      `,
    });

    const resultMap = new Map<number, string[]>();
    for (const item of output.suggestions) {
      resultMap.set(Number(item.tabId), item.groupNames);
    }
    if (onProgress) {
      onProgress(resultMap);
    }
    return resultMap;
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    const { output } = await generateText({
      model: this.model,
      output: Output.object({ schema: SimilaritySchemaType }),
      prompt: `
        You are a helpful assistant that identifies similar browser tabs.

        Reference Tab:
        - Title: "${referenceTab.title}"
        - URL: "${referenceTab.url}"

        Candidate Tabs:
        ${JSON.stringify(candidateTabs.map((t) => ({ id: t.id, title: t.title, url: t.url })))}

        Identify which candidate tabs are similar to the Reference Tab based on:
        1. Same Domain/Website
        2. Same Task (e.g., both are about booking a flight, even if different sites)
        3. Same Topic (e.g., both are about Python programming)
      `,
    });

    return output.similarTabIds || [];
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    const { output } = await generateText({
      model: this.model,
      output: Output.object({ schema: WindowNameSchemaType }),
      prompt: `
        You are a helpful assistant that names browser windows.

        Here is the content of the window:

        Tabs:
        ${JSON.stringify(tabs.map((t) => ({ title: t.title, url: t.url })))}

        Tab Groups:
        ${groups.join(', ')}

        Suggest a short, descriptive name for this window based on its content (e.g., "Work", "Research", "Shopping", "Dev").
        The name should be concise (1-3 words).
      `,
    });

    return output.windowName || '';
  }
}

/**
 * Batched strategy for smaller/local models (Llama 3 8B, Gemini Nano, etc.)
 * Breaks down large lists into smaller batches to maintain accuracy and prevent context overflow.
 */
export class BatchedLLMStrategy implements LLMService {
  private batchSize = 5;

  constructor(
    private model: LanguageModel,
    batchSize?: number,
  ) {
    if (batchSize) this.batchSize = batchSize;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>> {
    const resultMap = new Map<number, string[]>();

    const result = await chrome.storage.sync.get('predefined-groups');
    const predefinedGroups = (result['predefined-groups'] as string[]) || [];
    const allGroups = Array.from(new Set([...predefinedGroups, ...existingGroups]));

    for (let i = 0; i < tabs.length; i += this.batchSize) {
      const batch = tabs.slice(i, i + this.batchSize);

      const { output } = await generateText({
        model: this.model,
        output: Output.object({ schema: CategorizationSchemaType }),
        system: `
          You are a browser tab organizer.
          Rules:
          1. Suggest 1-3 concise group names for each tab.
          2. Reuse existing groups if possible.
          3. Return ONLY a JSON object with a "suggestions" array.
        `,
        prompt: `
          Input Tabs:
          ${JSON.stringify(batch.map((t) => ({ id: t.id, title: t.title, url: t.url })))}

          Existing Groups: ${JSON.stringify(allGroups)}
        `,
      });

      const batchResults = new Map<number, string[]>();
      for (const item of output.suggestions) {
        batchResults.set(Number(item.tabId), item.groupNames);
        resultMap.set(Number(item.tabId), item.groupNames);
      }

      if (onProgress) {
        onProgress(batchResults);
      }
    }

    return resultMap;
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    const allSimilarIds: number[] = [];

    for (let i = 0; i < candidateTabs.length; i += this.batchSize) {
      const batch = candidateTabs.slice(i, i + this.batchSize);

      const { output } = await generateText({
        model: this.model,
        output: Output.object({ schema: SimilaritySchemaType }),
        system: `Identify candidates similar to the reference (topic/domain/task).`,
        prompt: `
          Reference Tab: { "title": "${referenceTab.title}", "url": "${referenceTab.url}" }
          Candidates: ${JSON.stringify(batch.map((t) => ({ id: t.id, title: t.title, url: t.url })))}
        `,
      });

      if (output.similarTabIds) {
        allSimilarIds.push(...output.similarTabIds);
      }
    }

    return allSimilarIds;
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    // Window naming usually doesn't need batching as much since it's one summary,
    // but we can limit the number of tabs we describe to the model.
    const limitedTabs = tabs.slice(0, 20);

    const { output } = await generateText({
      model: this.model,
      output: Output.object({ schema: WindowNameSchemaType }),
      system: `Suggest a short (1-3 words) window name.`,
      prompt: `
        Tabs: ${JSON.stringify(limitedTabs.map((t) => ({ title: t.title, url: t.url })))}
        Groups: ${JSON.stringify(groups)}
      `,
    });

    return output.windowName || '';
  }
}
