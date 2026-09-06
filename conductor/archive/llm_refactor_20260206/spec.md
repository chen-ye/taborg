# Specification: OpenAI-Compatible LLM Service & Vercel AI SDK Transition

## Overview
TabOrg currently supports Google Gemini (via `@google/genai`) and Chrome's built-in AI (Gemini Nano). This track involves transitioning the remote LLM integrations to the **Vercel AI SDK** to standardize provider interactions and adding a new **OpenAI-compatible service**. This will allow users to use local models (e.g., Ollama) or other third-party APIs that follow the OpenAI specification.

## Functional Requirements
1.  **Standardize AI Integration:**
    -   Transition Google Gemini integration from `@google/genai` to `@ai-sdk/google`.
    -   Implement the new OpenAI-compatible service using `@ai-sdk/openai`.
2.  **Configurable OpenAI Service:**
    -   Allow users to specify a custom **Base URL** for the OpenAI provider in the extension settings.
    -   Allow users to provide an **API Key** for the OpenAI provider.
3.  **Model Selection:**
    -   Add a **Model ID** field for the Gemini service (e.g., defaulting to `gemini-1.5-flash`).
    -   Add a **Model ID** field for the OpenAI service (e.g., `gpt-4o`, `llama3`).
4.  **Updated Settings UI:**
    -   Modify the `settings-dialog` to include fields for OpenAI Base URL and Model IDs for both services.
5.  **Strategy-Based Architecture:**
    -   Differentiate between model usage strategies (e.g., `StandardLLMStrategy` for single-shot/parallel vs `BatchedLLMStrategy` for smaller models like Nano).
    -   Update `LLMManager` to dynamically select the correct `LanguageModel` (Provider) and `LLMStrategy` (Batching behavior).

## Non-Functional Requirements
-   **Reliability:** Use well-tested libraries (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`).
-   **Extensibility:** The unified interface should make it easy to add more Vercel AI SDK providers in the future.
-   **Backward Compatibility:** Ensure existing Chrome AI (Prompt API) functionality remains unaffected.

## Acceptance Criteria
- [ ] Users can successfully save and use an OpenAI-compatible endpoint (e.g., `http://localhost:11434/v1`).
- [ ] Users can specify and switch between different models for both Gemini and OpenAI providers.
- [ ] Tab grouping and organization features work correctly using the new OpenAI provider.
- [ ] All existing unit tests pass, and new tests cover the OpenAI integration.

## Out of Scope
-   Exposing advanced LLM parameters like `temperature`, `topK`, or `maxTokens` in this iteration.
-   Support for multi-modal inputs (images/audio).
