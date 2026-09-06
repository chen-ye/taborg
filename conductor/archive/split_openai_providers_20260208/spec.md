# Specification: Split OpenAI Provider

## Overview
This track involves splitting the current single "OpenAI" provider into two distinct providers:
1. **OpenAI (Standard):** Uses the standard OpenAI API via `@ai-sdk/openai`. It will no longer support a custom base URL.
2. **OpenAI (Custom):** Uses `@ai-sdk/openai-compatible` to support OpenAI-compliant endpoints (like Ollama, LocalAI, etc.). This provider will require a base URL configuration.

## Functional Requirements
- **New Provider Identity:** Introduce `openai-custom` as a new `LLMProvider` type.
- **Provider Implementation:**
    - Update `getOpenAIModel` to use standard `@ai-sdk/openai` settings (no base URL).
    - Implement `getCustomOpenAIModel` using `@ai-sdk/openai-compatible`.
- **Configuration Migration:**
    - Introduce fresh configuration keys: `openaiCustomBaseUrl`, `openaiCustomApiKey`, and `openaiCustomModelId`.
    - Deprecate `openaiBaseUrl` in the standard OpenAI configuration.
    - Do NOT perform automatic migration from `openaiBaseUrl` to the new custom keys (Fresh Start).
- **LLMManager Updates:**
    - Update `loadSettings` and `handleStorageChange` to manage the new configuration keys.
    - Update `getService` to handle the `openai-custom` provider.
- **UI Updates (Settings):**
    - Update the settings dialog to include the "OpenAI (Custom)" option.
    - Conditionally show/hide configuration fields based on the selected provider:
        - `openai`: API Key, Model ID.
        - `openai-custom`: Base URL, API Key, Model ID.

## Non-Functional Requirements
- **Consistency:** Maintain the existing pattern of using Vercel AI SDK strategies.
- **Type Safety:** Update `LLMProvider` and `LLMModelConfig` interfaces.

## Acceptance Criteria
- [ ] `LLMProvider` type includes `openai-custom`.
- [ ] Selecting "OpenAI" in settings uses the default OpenAI endpoint.
- [ ] Selecting "OpenAI (Custom)" in settings correctly routes requests to the provided base URL using `@ai-sdk/openai-compatible`.
- [ ] Unit tests verify that `LLMManager` initializes the correct provider based on settings.
- [ ] UI correctly reflects the required fields for each provider.
