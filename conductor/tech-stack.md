# Tech Stack

## Extension Framework
- **WXT:** Modern web extension framework for streamlined development, building, and publishing across browsers.

## UI & Design
- **Lit:** Light-weight base class for creating fast, lightweight web components.
- **Shoelace:** A forward-thinking library of high-quality web components with a native-feel.
- **CSS:** Modern CSS patterns including variables and nesting.

## Language & Tooling
- **TypeScript:** Primary programming language for type-safety and modern features.
- **Yarn (v4):** Package manager with workspace support for managing the extension and MCP server.
- **Biome:** Fast formatter and linter for maintaining code quality.

## AI & Data
- **Vercel AI SDK (ai):** Unified interface for interacting with various LLM providers.
- **Google Gemini (@ai-sdk/google):** Remote LLM integration for advanced task analysis.
- **OpenAI (@ai-sdk/openai):** Support for OpenAI and OpenAI-compatible APIs (e.g., Ollama, LocalAI).
- **Chrome Built-in AI (Prompt API):** On-device Gemini Nano integration for privacy-first, low-latency AI tasks.
- **Zod:** Schema validation for structured AI outputs.
- **@lit-labs/signals:** Reactive state management for efficient UI updates based on tab and window changes.

## Testing & Verification
- **Vitest:** Blazing fast unit test runner for verifying business logic and state transitions.

## MCP Server
- **Node.js:** Runtime for the local MCP bridge server.
- **Express:** Web framework for handling WebSocket and HTTP connections from external agents.
