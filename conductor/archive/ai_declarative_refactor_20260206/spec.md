# Specification: Declarative AI Configuration & Reliability Refactor

## Overview
This track refactors the AI service architecture to use a declarative configuration pattern, standardizes on the Vercel AI SDK for remote providers, and implements several reliability and performance improvements identified in previous reviews. The existing `ChromeAIService` is retained to handle browser-specific offscreen requirements.

## Functional Requirements
1.  **Declarative Provider Configuration:**
    -   Define an internal configuration mapping `LLMProvider` IDs to their respective setup logic.
    -   For `gemini` and `openai`: Map to a model getter (returning a `LanguageModel`) and a default strategy (`StandardLLMStrategy`).
    -   For `chrome-ai`: Map to the existing `ChromeAIService` implementation.
2.  **Strategy Selection & Overrides:**
    -   `LLMManager.getService` should use the declarative config to instantiate the provider.
    -   Add a new user setting `llm-strategy-override` (dropdown: "Default", "Standard", "Batched") in the `settings-dialog`.
    -   If an override is set (and the provider supports it), it must take precedence over the provider's default strategy.
3.  **Performance & Reliability (Review Fixes):**
    -   **Instance Caching:** Cache the active `LLMService` instance in `LLMManager`. Re-instantiate only when relevant settings (provider, API key, model, override) change.
    -   **Settings Race Condition Fix:** Update `loadSettings` to use logical nullish assignment (`??=`) to prevent overwriting concurrent updates from storage listeners.
    -   **Relaxed OpenAI Key Constraint:** Allow OpenAI providers to function without a key if a `baseURL` is provided (supporting local/LAN endpoints).
    -   **Prompt Standardization:** Update `StandardLLMStrategy` to use `JSON.stringify` for tab data, matching the robust formatting used in the batched strategy.

## Acceptance Criteria
- [ ] Tab grouping works correctly for all providers.
- [ ] `LLMManager` logic is significantly simplified through declarative configuration.
- [ ] OpenAI-compatible endpoints on the local network (e.g., `http://192.168.1.50:11434/v1`) work without an API key.
- [ ] Users can manually force "Batched" mode for remote providers via settings.
- [ ] `LLMManager` does not redundanty create model/strategy objects on every call.
- [ ] All unit and E2E tests pass.

## Out of Scope
- Support for multi-modal browser-ai features.
- Advanced parameter tuning (temperature, etc.) in this iteration.
- Transitioning Chrome Built-in AI to the Vercel AI SDK (`browser-ai`) in this track.
