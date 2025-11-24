import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `
      You are a helpful assistant that organizes browser tabs.

      Here is a list of tabs:
      ${tabs.map(t => `- ID: ${t.id}, Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Here is a list of existing tab groups:
      ${allGroups.join(', ')}

      For each tab, suggest up to 3 group names.
      Prefer using existing group names if they fit well.
      If no existing group fits, create a new short, descriptive group name (e.g., "Dev", "News", "Social").

      Return the result as a JSON object where keys are Tab IDs and values are arrays of strings (group names).
      Example:
      {
        "123": ["Work", "Project X"],
        "456": ["Social", "Facebook"]
      }

      Do not include markdown formatting in the response, just the raw JSON string.
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Clean up potential markdown code blocks
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const suggestions = JSON.parse(jsonStr);

      const resultMap = new Map<number, string[]>();
      for (const [id, groups] of Object.entries(suggestions)) {
        resultMap.set(Number(id), groups as string[]);
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

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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

      Return ONLY a JSON array of the IDs of the similar tabs.
      Example: [123, 456, 789]
      If no tabs are similar, return [].
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Robust JSON extraction
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1) {
         // Fallback or empty if not found, but let's try to parse whole text if no brackets found (unlikely given prompt)
         throw new Error('Invalid JSON response');
      }
      const jsonStr = text.substring(start, end + 1);

      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }

  async generateWindowName(tabs: { title: string; url: string }[], groups: string[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API Key not set');
    }

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `
      You are a helpful assistant that names browser windows.

      Here is the content of the window:

      Tabs:
      ${tabs.map(t => `- Title: "${t.title}", URL: "${t.url}"`).join('\n')}

      Tab Groups:
      ${groups.join(', ')}

      Suggest a short, descriptive name for this window based on its content (e.g., "Work", "Research", "Shopping", "Dev").
      The name should be concise (1-3 words).

      Return ONLY the suggested name as a plain string. Do not include quotes or markdown.
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
