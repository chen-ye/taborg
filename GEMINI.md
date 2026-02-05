65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M65;37;32M0;44;25M0;44;25m65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M65;44;25M0;44;25M0;44;25m# TabOrg Project Context

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
- **MCP:** The server acts as a multiplexing bridge between multiple extension
  instances (identified by `instanceId` in the WebSocket path) and MCP clients.

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

> **⚠️ CRITICAL API CHANGE**
> * **Outdated**: The direct `window.ai()` function is **deprecated** and **SHALL NOT** be used.
> * **Valid**: The only valid entry point is **`window.ai.languageModel`** (implementation of the `LanguageModel` interface). All interactions must go through this interface.

  - **Note:** As of Chrome 133+, this feature is Generally Available (GA) and no
    longer requires the `aiLanguageModelOriginTrial` permission in
    `manifest.json`.


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

## Setup
1.  **Enable Flags** (required for local development):
    * `chrome://flags/#optimization-guide-on-device-model` -> **Enabled**
    * `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` -> **Enabled**
    * *Restart Chrome after changing flags.*
2.  **Install Types** (Optional for TypeScript):
    ```bash
    npm install @types/dom-chromium-ai
    ```

## Core API Usage

All operations utilize `window.ai.languageModel`.

### 1. Check Model Availability
Always check availability before usage. This step may trigger the model download.

```javascript
// Access via the standard namespace
const { languageModel } = window.ai;

const availability = await languageModel.availability();

if (availability === 'no') {
  // Model not supported on this device
} else if (availability === 'after-download') {
  // Model will be downloaded when create() is called
} else if (availability === 'readily') {
  // Model is ready to use
}
```

### 2. Create a Session
A session maintains the conversation history (context).

```javascript
// Monitor download progress
const session = await window.ai.languageModel.create({
  temperature: 0.8,
  topK: 3,
  monitor(m) {
    m.addEventListener('downloadprogress', (e) => {
      console.log(`Downloaded ${e.loaded * 100}%`);
    });
  }
});
```

### 3. Prompting the Model
There are two methods to retrieve responses:

**A. Single Request (`prompt`)**
Returns the result once the generation is complete.
```javascript
const result = await session.prompt("Write a haiku about coding.");
console.log(result);
```

**B. Streaming Response (`promptStreaming`)**
Returns a `ReadableStream`. Essential for improving perceived performance on longer tasks.
```javascript
const stream = session.promptStreaming("Write a long story.");
for await (const chunk of stream) {
  console.log(chunk); // Process partial results as they arrive
}
```

### 4. Session Management
* **Token Usage**: specific limits apply to the context window.
    ```javascript
    console.log(`${session.inputUsage} / ${session.inputQuota}`);
    ```
* **Clone**: Create a branch of the conversation with the same history.
    ```javascript
    const newSession = await session.clone();
    ```
* **Destroy**: **Crucial step.** Always destroy sessions when done to free up memory.
    ```javascript
    session.destroy();
    ```

## Advanced Features

### System Prompts & Roles
Define the model's persona using `initialPrompts`.

```javascript
const session = await window.ai.languageModel.create({
  initialPrompts: [
    { role: 'system', content: 'You are a strict code reviewer.' },
    { role: 'user', content: 'var x = 1;' },
    { role: 'assistant', content: 'Prefer const or let.' }
  ]
});
```

### Multimodal Input (Images & Audio)
The API supports prompts containing text, images (Blob, Canvas), and audio.

```javascript
const session = await window.ai.languageModel.create({
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" }
  ]
});

// Assuming 'imageBlob' is a valid Blob or HTMLCanvasElement
const result = await session.prompt([
  { role: "user", content: [
      { type: "text", value: "Describe this image:" },
      { type: "image", value: imageBlob }
    ]
  }
]);
```

### Structured Output (JSON Schema)
Enforce valid JSON output by passing a schema.

```javascript
const schema = {
  type: "object",
  properties: {
    rating: { type: "number" },
    sentiment: { type: "string" }
  }
};

const result = await session.prompt(
  "Rate this movie: It was okay, not great.",
  { responseConstraint: schema }
);

const json = JSON.parse(result); 
```

## Best Practices
1.  **Avoid `window.ai()`**: Any tutorial referencing `await window.ai("prompt")` is obsolete. Use `window.ai.languageModel`.
2.  **AbortSignals**: Implement `AbortController` in your `create()` and `prompt()` calls to handle user cancellation gracefully.
3.  **Context Window**: Destroy and recreate sessions if they hit the token limit (`session.inputQuota`).
4.  **WWorkers**: The API is currently **not** supported inside Web Workers.
