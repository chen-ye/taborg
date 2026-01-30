export interface TabData {
  id: number;
  title: string;
  url: string;
}

export interface LLMService {
  isAvailable(): Promise<boolean>;
  categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>>;
  findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]>;
  generateWindowName(tabs: TabData[], groups: string[]): Promise<string>;
}

export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  required?: string[];
  description?: string;
};
