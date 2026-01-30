# TabOrg Project Context

## Overview

TabOrg is a Chrome extension for granular, incremental tab management. It is
designed for asynchronous workflows, allowing users to create tabs and windows
freely while providing AI-assisted suggestions for grouping and organization via
Google Gemini. It also includes a local Model Context Protocol (MCP) server to
allow external LLMs to interact with browser tabs.

## Tech Stack

- **Extension Framework:** [WXT](https://wxt.dev/)
- **UI Framework:** [Lit](https://lit.dev/) +
  [Shoelace](https://shoelace.style/)
- **Language:** TypeScript
- **Package Manager:** Yarn (v4+, utilizing workspaces)
- **AI Integration:** Google Gemini (`@google/genai`) and Chrome Built-in AI
  (Prompt API).
- **State Management:** `@lit-labs/signals`
- **Testing:** Vitest
- **Linting/Formatting:** Biome

## Project Structure

- `components/`: UI components (Lit elements).
- `entrypoints/`: WXT entry points (background script, sidepanel, offscreen).
- `server/`: Local MCP bridge server (Node.js/Express).
- `services/`: Business logic organized by domain:
  - `ai/`: LLM integrations (Gemini, Chrome AI).
  - `tabs/`: Tab state and browser interactions.
  - `mcp/`: MCP connection logic.
- `utils/`: Shared utilities (`message-types`, `schemas`, etc).
- `types/`: TypeScript type definitions.
- `tests/`: Unit and integration tests.
- `public/` & `assets/`: Static assets.

## Key Development Commands

### Extension

- **Start Dev Server:** `yarn dev` (Starts Chrome with HMR)
- **Build Production:** `yarn build` (Output in `.output/`)
- **Run Tests:** `yarn test`
- **Lint:** `yarn lint`
- **Format:** `yarn format`
- **Type Check:** `yarn compile`

### MCP Server

- **Start Server:** `yarn server:start`
- **Dev Server:** `yarn server:dev`
- **Build Server:** `yarn server:build`

## Conventions

- **Components:** Built using Lit with decorators. Styles are defined within the
  component using `css`.
- **State:** Reactive state management using Signals (`tabStore`).
- **Styling:** Shoelace components are used for the base UI. Custom styles
  follow standard CSS patterns.
- **MCP:** The server acts as a bridge between the extension (via WebSocket) and
  MCP clients.

## Meta Conventions

- **Standards-Based Development:** Preference for standard web APIs and specs.
- **Evergreen Target:** Assume modern, up-to-date browsers and environments.
- **Web Components:** Primary building block for UI (via Lit).
- **Modern JavaScript/CSS:** Utilize latest TC39 features and modern CSS
  (nesting, variables, etc.).
- **Native TypeScript:** Leverage native Node.js 23+ TypeScript support where
  applicable.

## Chrome Built-in AI (Prompt API) Reference

The project utilizes the **Prompt API** to access Chrome's built-in Gemini Nano
model.

- **Capabilities:**
  - **Local Execution:** Runs entirely on-device (privacy-first, low latency, no
    API keys).
  - **Session Management:** `LanguageModel.create()` starts a session with
    preserved context.
  - **Structured Output:** Supports JSON Schema via `responseConstraint` in
    `prompt()`.
  - **System Prompts:** Can be defined via `systemPrompt` (or `initialPrompts`)
    during session creation.

- **Usage Pattern:**
  1. **Check Availability:** `window.ai.languageModel.availability()` (returns
     `'readily'`, `'after-download'`, or `'no'`).
  2. **Create Session:**
     `await window.ai.languageModel.create({ systemPrompt: '...' })`.
  3. **Prompt:**
     `await session.prompt('User input', { responseConstraint: ... })`.
  4. **Destroy:** `session.destroy()` to free resources.

- **Requirements:**
  - Chrome Desktop (Mac, Windows, Linux).
  - Sufficient hardware (GPU/RAM) for Gemini Nano.
  - **Note:** As of Chrome 133+, this feature is Generally Available (GA) and no
    longer requires the `aiLanguageModelOriginTrial` permission in
    `manifest.json`.
