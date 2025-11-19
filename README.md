# TabOrg

TabOrg is a powerful Chrome extension designed to help you organize your browser tabs and windows efficiently. It provides a vertical tree-style view of your tabs, intelligent grouping, and AI-powered window naming.

## Features

### Semi-Automated Tab Organization

TabOrg takes a unique approach to tab management that puts you in control while leveraging AI assistance:

1. **Granular Selection**: Select specific tabs using checkboxes in the tree view, or quickly select all ungrouped tabs with one click.
2. **AI-Powered Suggestions**: Click "Organize Tabs" to have Google Gemini analyze your selected tabs and suggest intelligent groupings based on content similarity and context.
3. **Review & Apply**: Preview suggested groups before applying them. Accept all suggestions at once or pick and choose which groupings make sense for your workflow.
4. **Manual Refinement**: Easily reassign tabs to different groups or create your own groups from scratch using the dropdown menu on each tab.

This workflow distinguishes TabOrg from fully automated solutions that make decisions for you, and from manual-only approaches that require tedious organization. You get the best of both worlds: AI insights with human oversight.

### Core Features

- **Tree-Style Tab View**: View all your open windows and tabs in a hierarchical sidebar with expand/collapse controls.
- **Tab Management**: Close, switch to, and reorder tabs with simple clicks and drag-and-drop.
- **Group Management**: Create, rename, and colorize tab groups. Move tabs between groups or windows.
- **AI Window Naming**: Automatically generate descriptive names for your windows based on their contained tabs and groups using Google Gemini.
- **Theme Support**: Seamlessly adapts to your system's light or dark mode, including dynamic extension icons.


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
