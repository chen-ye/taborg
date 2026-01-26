# TabOrg

TabOrg is a Chrome extension for granular, incremental tab management. It is
designed for asynchronous workflows, allowing users to create tabs and windows
freely while providing AI-assisted suggestions for grouping and organization.

This workflow distinguishes TabOrg from fully automated solutions that make
decisions for you, and from manual-only approaches that require tedious
organization.

## Features

### Semi-Automated Tab Organization

TabOrg provides AI assistance for tab management while retaining user control:

1. **Granular Selection**: Select specific tabs using checkboxes in the tree
   view, or quickly select all ungrouped tabs.
2. **AI Suggestions**: Click "Organize Tabs" to have Google Gemini analyze
   selected tabs and suggest groupings based on content.
3. **Review & Apply**: Preview suggested groups before applying them. Accept all
   suggestions or select specific groupings.
4. **Manual Refinement**: Reassign tabs to different groups or create groups
   manually using the dropdown menu.

### Core Features

- **Hierarchical Vertical Tab View**: View all your open windows and tabs in a
  tree within the sidepanel.
- **Tab Management**: Close, switch to, and reorder tabs with clicks or
  drag-and-drop.
- **Group Management**: Create, rename, and colorize tab groups. Move tabs
  between groups or windows.
- **AI Window Naming**: Automatically generate names for windows based on their
  contained tabs and groups using Google Gemini.
- **Theme Support**: Adapts to system light or dark mode, including dynamic
  extension icons.

## MCP Server

TabOrg exposes a local
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that
allows external LLMs (like Claude Desktop or MCP Inspector) to interact with
your browser tabs.

### Capabilities

- **List Tabs**: Query your open tabs and groups.
- **Manipulate**: Group, move, and close tabs programmatically.

### Setup

1. **Start the MCP Bridge Server**: The extension requires a local bridge server
   to communicate with the MCP client.
   ```bash
   yarn workspace @taborg/server start
   ```

2. **Enable in Extension**:
   - Open TabOrg Settings.
   - Toggle **Enable MCP Server** to ON.
   - Verify the status shows "Connected".

3. **Connect your MCP Client**:
   > Note: Claude Desktop requires an SSE-to-Stdio bridge to connect to local
   > HTTP servers.
   ```json
   {
     "mcpServers": {
       "taborg": {
         "command": "npx",
         "args": ["-y", "mcp-proxy", "http://localhost:3000/mcp"]
       }
     }
   }
   ```
   - **MCP Inspector**:
     ```bash
     npx @modelcontextprotocol/inspector http://localhost:3000/mcp
     ```

   - **Gemini CLI**:

     **Option 1: Using the CLI (Recommended)**
     ```bash
     gemini mcp add taborg http://localhost:3000/mcp
     ```

     **Option 2: Manual Configuration** Add to your `~/.gemini/settings.json`:
     ```json
     {
       "mcpServers": {
         "taborg": {
           "httpUrl": "http://localhost:3000/mcp"
         }
       }
     }
     ```

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Web Extension Framework)
- **UI Library**: [Shoelace](https://shoelace.style/) & [Lit](https://lit.dev/)
- **Language**: TypeScript
- **Package Manager**: Yarn

## Development

### Prerequisites

- Node.js (v18+)
- Yarn (v4+)

### Setup

1. Clone the repository.
2. Enable Corepack to use the correct Yarn version:
   ```bash
   corepack enable
   ```
3. Install dependencies:
   ```bash
   yarn install
   ```

### Running Locally

To start the development server with hot module replacement:

```bash
yarn dev
```

This will open a new Chrome instance with the extension loaded.

### Building

To build the extension for production:

```bash
yarn build
```

The output will be in the `.output/` directory.

## License

MIT
