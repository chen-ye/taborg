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
2. **AI Suggestions**: Click "Organize Tabs" to have Google Gemini or Chrome
   Built-in AI analyze selected tabs and suggest groupings based on content.
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
  contained tabs and groups using Google Gemini or Chrome Built-in AI.
- **Theme Support**: Adapts to system light or dark mode, including dynamic
  extension icons.

## AI Configuration

TabOrg supports multiple AI providers for organizing your tabs. Configure these
in **Settings**.

### Google Gemini

1. Obtain an API Key from [Google AI Studio](https://aistudio.google.com/).
2. Enter the key in the **Gemini API Key** field.
3. (Optional) Customize the **Model ID** (default: `gemini-1.5-flash`).

### OpenAI

1. Obtain an API Key from [OpenAI Platform](https://platform.openai.com/).
2. Enter the key in the **OpenAI API Key** field.
3. (Optional) Customize the **Model ID** (default: `gpt-4o`).

### Custom OpenAI (Local Models)

Connect to local LLMs (like [Ollama](https://ollama.com/) or
[LM Studio](https://lmstudio.ai/)) or other OpenAI-compatible endpoints.

1. **Base URL**: Enter your server's endpoint (e.g., `http://localhost:11434/v1`
   for Ollama).
2. **API Key**: Enter your specific key if required.
3. **Model ID**: Enter the model name you are running (e.g., `llama3`).

### Chrome Built-in AI

TabOrg can utilize Chrome's on-device Gemini Nano model for privacy-first,
offline organization.

**Prerequisites:**

- **Chrome 133+**: This feature is stable (GA) in newer versions.
- **Older Versions / Local Development**:
  1. Go to `chrome://flags`.
  2. Enable **Enables optimization guide on device**
     (`#optimization-guide-on-device-model`).
  3. Enable **Prompt API for Gemini Nano**
     (`#prompt-api-for-gemini-nano-multimodal-input`).
  4. Restart Chrome.

## Configuration

### Predefined Groups

Define static group names that the AI should prioritize when organizing tabs.

- Enter comma-separated names (e.g., `Work, Personal, Research`).
- Matches are case-insensitive.

### Auto-Categorization Mode

Control when the AI automatically suggests tab groups:

- **Initial**: Analyzes tabs only when they are first opened or when you
  explicitly request organization.
- **Always**: Continuously monitors and updates groupings (use with caution
  regarding API usage).
- **Off**: Only organizes when manually triggered.

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
     npx @modelcontextprotocol/inspector http://localhost:3000/default/mcp
     ```

   - **Gemini CLI**:

     **Option 1: Using the CLI (Recommended)**
     ```bash
     # Connect to the default instance
     gemini mcp add taborg http://localhost:3000/default/mcp

     # OR connect to a specific profile (e.g., your email)
     gemini mcp add taborg-work http://localhost:3000/your.email@example.com/mcp
     ```

     **Option 2: Manual Configuration** Add to your `~/.gemini/settings.json`:
     ```json
     {
       "mcpServers": {
         "taborg": {
           "httpUrl": "http://localhost:3000/default/mcp"
         }
       }
     }
     ```
     > **Note**: Replace `default` with your Instance ID (found in Extension
     > Settings) if you are using specific profiles or multiple instances. By
     > default, it uses your Chrome profile email.

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
