# Initial Concept
TabOrg is a Chrome extension for granular, incremental tab management. It is designed for asynchronous workflows, allowing users to create tabs and windows freely while providing AI-assisted suggestions for grouping and organization.

# Product Definition

## Target Audience
- **Power Users:** Individuals who manage dozens of tabs and windows simultaneously and require sophisticated tools to maintain order.
- **Control-Oriented Users:** Users who prefer semi-automated organization where they retain final decision-making power, rather than fully autonomous solutions.
- **Developer Ecosystem:** Users who leverage LLMs and the Model Context Protocol (MCP) to interact with and automate their browser environment.

## User Experience Goals
- **Seamless Hierarchical Visualization:** Provide a non-intrusive, vertical tree view of all open tabs and windows that feels like a native part of the browser.
- **Human-in-the-loop AI:** Deliver AI suggestions that act as a "guide" for organization, allowing users to preview, refine, and approve groupings.
- **Context Preservation:** Minimize the friction of switching between unrelated tasks by organizing tabs into logical, named windows and groups.

## Key Features
- **Configurable AI Categorization:** Groups can be defined with descriptions to aid classification, with the AI capable of auto-generating these descriptions by examining existing tab members.
- **State Persistence:** Robust saving of custom tab group names, colors, and window identities to ensure the workspace remains organized across browser sessions.
- **Hierarchical Tab Tree:** A vertical representation of the browser state with granular selection capabilities (checkboxes) for targeted organization.
- **Local MCP Server:** A built-in bridge allowing external agents to query and manipulate tabs programmatically.
- **Advanced Search:** Integrated filtering (via Fuse.js) to quickly locate tabs within large windows.

## Visual Identity
- **Native & Clean:** A minimalist aesthetic utilizing Shoelace components that blends naturally with the Chrome browser UI.
- **Adaptive Design:** Full support for system-level light and dark modes, including dynamic extension icons that switch based on the theme.

## Privacy & Security
- **Local-First AI:** Default to on-device processing using Chrome's built-in Gemini Nano for immediate functionality and privacy.
- **Flexible LLM Integration:** Support for Google Gemini API and any OpenAI-compatible API (including local models like Ollama) with dynamic retrieval of available models and configurable selection.
- **Explicit Consent:** Remote LLM integration requires a user-provided API key (or custom endpoint), and the MCP bridge must be manually started by the user.
