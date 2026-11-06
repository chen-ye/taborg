# Specification: Dynamic Model Retrieval

## Overview
This track implements dynamic retrieval of available AI models for Gemini, OpenAI, and OpenAI (Custom) providers. Instead of manually typing model IDs, users will be presented with a list of available models fetched directly from the provider's API using the Vercel AI SDK.

## Functional Requirements
- **Model Fetching Logic:**
    - Implement `fetchModels(provider, config)` in `services/ai/providers.ts`.
    - Use provider-specific SDK methods where available (e.g., `google.listModels()`, `openai.models.list()`).
- **Trigger Mechanisms:**
    - **Automatic:** Fetch models whenever configuration keys (API Key or Base URL) are saved and valid.
    - **Manual:** Provide a refresh button next to the model ID input field.
- **UI Implementation:**
    - **Model Suggestions:** Use HTML `<datalist>` to populate suggestions for the Model ID `<sl-input>` fields.
    - **Status Indicators:**
        - While fetching, the refresh button is replaced by a loading spinner.
        - If fetching fails, display an error icon (e.g., `exclamation-circle`) which can be hovered for detail.
- **State Management:**
    - Store fetched model lists in the `SettingsDialog` state (memory only).
    - Lists are refetched when the settings dialog is opened if configuration is present.

## Non-Functional Requirements
- **Performance:** Avoid blocking the main UI thread during fetching.
- **Robustness:** Gracefully handle API errors (e.g., rate limits, invalid keys) without crashing the settings dialog.

## Acceptance Criteria
- [ ] Gemini model input shows a list of available models after a valid API key is entered.
- [ ] OpenAI model input shows a list of available models after a valid API key is entered.
- [ ] OpenAI (Custom) model input shows a list of available models after a valid Base URL (and API Key if needed) is entered.
- [ ] A manual refresh button/icon exists next to model inputs and shows a loading state.
- [ ] An error icon appears if model fetching fails.
- [ ] The user can still manually type a model ID not in the suggested list.

## Out of Scope
- Persisting fetched model lists to disk/storage.
- Support for Chrome Built-in AI model listing (handled by Prompt API availability).
