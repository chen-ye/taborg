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

## Advanced MCP Capabilities

### 1. Transparent Suspended URL Decoding
TabOrg automatically parses and decodes suspended URLs (e.g. from the Marvellous Suspender or other tab-suspension extensions) inside `browserService.getTabs()`. External LLM agents and frontend views seamlessly read the target webpage addresses (`https://...`) instead of internal extension schemas, ensuring accurate classification and deduplication.

### 2. Specialized Filters in `taborg_list_tabs`
Listing massive numbers of tabs (over 1,000) causes performance issues and consumes significant token context. The `taborg_list_tabs` tool provides high-performance native filters:
- `ungroupedOnly` (boolean): Returns only tabs that do not belong to any group (`groupId === -1`).
- `pinned` (boolean): Filters tabs by pinned status (`true` or `false`).
- `excludeGroupIds` (array of numbers): Ignores tabs belonging to specified groups.
- `titleQuery` (string): Filters tabs by title using case-insensitive substring matching or simple glob wildcards (e.g., `*github*` or `Dev*`).
- `urlQuery` (string): Filters tabs by URL using case-insensitive substring matching or simple glob wildcards (e.g., `*.github.com*` or `*google*`).
- `lastAccessedBefore` / `lastAccessedAfter` (number): Filters tabs based on their last accessed epoch timestamp (in milliseconds). **Fails open**: always includes tabs that do not have this timestamp property populated.
- `firstAccessedBefore` / `firstAccessedAfter` (number): Filters tabs based on their first accessed epoch timestamp (in milliseconds). **Fails open**: always includes tabs that do not have this timestamp property populated.

Additionally, each returned tab object exposes `pinned: true` when pinned (mirroring the `active: true` pattern), allowing external LLMs and callers to distinguish pinned tabs from unorganized ungrouped tabs.

### 3. Structural Proximity & Adjacency Finder
The `taborg_get_tab_chains` tool dynamically discovers ungrouped tabs associated with a set of focal tabs or groups based on:
- **Physical Proximity:** Same window, within standard index offsets (default: $\pm 3$).
- **Historical Context:** Parent-child navigation links tracked via `openerTabId`.

### 4. Tab Creation & Batch Spawning (`taborg_create_tabs`)
The `taborg_create_tabs` tool enables creating one or more new tabs programmatically. It accepts an array of tab definitions with options for `url`, `windowId`, `groupId` (automatically grouping the tab upon creation), `pinned`, and `active` (defaults to `false` for non-intrusive background tab creation).

---

## Chrome Extensions API & MCP Quirks

When building or invoking MCP tools that manipulate tabs and groups, keep the following Chromium behaviors in mind:

1. **Pending Navigation URLs (`tab.pendingUrl`)**:
   `chrome.tabs.create({ url, active: false })` resolves as soon as the tab object is allocated, before navigation commits. At that moment `tab.url` is `""` while `tab.pendingUrl` holds the target URL. `BrowserService.getTab()` and `getTabs()` fall back to `t.url || t.pendingUrl || ''` so newly spawned background tabs immediately report their target URL.
2. **Intra-Group Ordering & `chrome.tabs.group()`**:
   Calling `chrome.tabs.group({ tabIds, groupId })` on tabs that are already inside `groupId` moves those tabs to the end of the group. `BrowserService.groupTabs()` avoids moving tabs that are already in the target window to `index: -1` and skips re-grouping tabs that already belong to `groupId`, preserving relative tab order.
3. **Group Boundary Semantics on `chrome.tabs.move()` (`taborg_move_tabs_relative`)**:
   Chrome models tab groups as contiguous index ranges. Moving an ungrouped tab to `firstTabInGroup.index` (`position: 'before'`) places the tab immediately to the left of the group header (outside the group) unless it already belongs to that group. `BrowserService.moveTabsRelative()` assigns moved tabs to `targetTab.groupId` first before moving them to `refreshedTarget.index`, ensuring tabs moved `"before"` the first tab of a group stay inside the group at position 1.
4. **Pinned Tabs Have `groupId === -1`**:
   In Chrome, pinned tabs cannot belong to a group and always report `groupId: -1`. When querying unorganized tabs via `taborg_list_tabs`, always combine `ungroupedOnly: true` with `pinned: false`—passing a pinned tab ID to `chrome.tabs.group()` will forcibly unpin it.
5. **Cross-Profile Google Account Indices (`/u/1/`, `?authuser=1`)**:
   When migrating Google Workspace, Gemini, or NotebookLM URLs across browser profiles (e.g., from a Work profile where a personal account is `/u/1/` to a Personal profile where that account is `/u/0/`), strip `/u/\d+` and `authuser=\d+` query parameters to prevent `accounts.google.com/v3/signin/confirmidentifier` redirect loops.

---

## Development Commands

- `yarn dev`: Start WXT dev server (Chrome with HMR).
- `yarn server:dev`: Start MCP bridge server with `tsx --watch`.
- `yarn compile`: Run TypeScript type checking.
- `yarn lint`: Run Biome linting and formatting checks.
- `yarn test`: Run unit tests with Vitest.
