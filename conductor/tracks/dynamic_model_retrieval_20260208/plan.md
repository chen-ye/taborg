# Implementation Plan: Dynamic Model Retrieval

## Phase 1: Model Fetching Logic (TDD)
- [~] Task: Implement `listModels` for Gemini, OpenAI, and OpenAI-Compatible in `services/ai/providers.ts`
    - [ ] Write unit tests in `services/ai/providers.test.ts` to verify model retrieval logic (mocking SDK calls)
    - [ ] Implement `listGoogleModels(config)`, `listOpenAIModels(config)`, and `listCustomModels(config)`
- [~] Task: Add `FETCH_MODELS` message type and handle it in the background script/offscreen if necessary
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Model Fetching Logic' (Protocol in workflow.md)

## Phase 2: Settings Dialog Integration
- [ ] Task: Update `SettingsDialog` state to manage model lists, loading status, and errors for each provider
- [ ] Task: Update `SettingsDialog` UI to include `<datalist>` elements for model inputs
- [ ] Task: Add manual refresh button and loading/error indicators to the model input rows
- [ ] Task: Implement automatic fetching logic on configuration changes (sl-blur/save)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Settings Dialog Integration' (Protocol in workflow.md)

## Phase 3: Verification and Polishing
- [ ] Task: Verify that manual model ID entry still works (datalist behavior)
- [ ] Task: Ensure errors are handled gracefully and don't block other setting operations
- [ ] Task: Run full test suite and verify no regressions
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Verification and Polishing' (Protocol in workflow.md)
