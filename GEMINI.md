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
- **AI Integration:** Google Gemini (`@google/genai`)
- **State Management:** `@lit-labs/signals`
- **Testing:** Vitest
- **Linting/Formatting:** Biome

## Project Structure

- `components/`: UI components (Lit elements).
- `entrypoints/`: WXT entry points (background script, sidepanel, offscreen).
- `server/`: Local MCP bridge server (Node.js/Express).
- `services/`: Business logic (TabStore, Gemini integration, MCP connection).
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
