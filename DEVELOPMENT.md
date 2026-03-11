# TabOrg Developer Guide

This document outlines the architectural patterns and idiomatic workflows for developing TabOrg, with a focus on extending the Model Context Protocol (MCP) capabilities.

## Architecture Overview

- **Extension Framework:** [WXT](https://wxt.dev/) manages entrypoints and build processes.
- **MCP Bridge:** A Node.js/Express server (`server/src/index.ts`) acts as a multiplexing bridge between the Chrome Extension (via WebSockets) and MCP Clients (via HTTP/SSE).
- **Business Logic:** Centralized in `services/`. Most browser interactions occur in `services/tabs/browser-service.ts`.
- **State Management:** Reactive state using `@lit-labs/signals`.

## Adding or Updating MCP Tools

TabOrg exposes browser capabilities to LLMs via MCP Tools.

### 1. Implement Core Logic
Add the underlying browser interaction to `services/tabs/browser-service.ts`. Always use standard `chrome.*` APIs.

```typescript
// Example: services/tabs/browser-service.ts
async updateGroup(groupId: number, updateInfo: chrome.tabGroups.UpdateProperties) {
  await chrome.tabGroups.update(groupId, updateInfo);
}
```

### 2. Register the MCP Tool
Register the tool in the `initializeMcpTools()` function within `entrypoints/background.ts`.

- **Name:** Follow the `taborg_<action>_<entity>` pattern.
- **Description:** Provide a clear, semantic description. If the tool is destructive, mention that the agent should explain the action to the user first.
- **Schema:** Use JSON Schema for `inputSchema`. Be specific about types and descriptions.

```typescript
// Example: entrypoints/background.ts
mcpService.registerTool(
  {
    name: 'taborg_rename_group',
    description: 'Rename an existing tab group...',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'number', description: 'The ID of the group' },
        title: { type: 'string', description: 'The new title' },
      },
      required: ['groupId', 'title'],
    },
  },
  async (args) => {
    const { groupId, title } = args as { groupId: number; title: string };
    await browserService.updateGroup(groupId, { title });
    return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
  }
);
```

### 3. Update MCP Prompts
If the new tool should be used by the "organize tabs" agent, update the instructions in `initializeMcpPrompts()` within `entrypoints/background.ts`.

## Adding MCP Resources

Resources provide read-only context to LLMs.

1. Implement the data retrieval in `browser-service.ts`.
2. Register the resource in `initializeMcpResources()` within `entrypoints/background.ts`.
3. Use the `taborg://${instanceId}/<resource_name>` URI pattern.

## Development Commands

- `yarn dev`: Start WXT dev server (Chrome with HMR).
- `yarn server:dev`: Start MCP bridge server with `tsx --watch`.
- `yarn compile`: Run TypeScript type checking.
- `yarn lint`: Run Biome linting and formatting checks.
- `yarn test`: Run unit tests with Vitest.
