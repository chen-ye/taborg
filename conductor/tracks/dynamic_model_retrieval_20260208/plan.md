# Implementation Plan: Dynamic Model Retrieval

## Phase 1: Model Fetching Logic (TDD) [checkpoint: 6558257]
- [x] Task: Implement `listModels` for Gemini, OpenAI, and OpenAI-Compatible in `services/ai/providers.ts` 32565df
    - [x] Write unit tests in `services/ai/providers.test.ts` to verify model retrieval logic (mocking SDK calls)
    - [x] Implement `listGoogleModels(config)`, `listOpenAIModels(config)`, and `listCustomModels(config)`
- [x] Task: Add `FETCH_MODELS` message type and handle it in the background script/offscreen if necessary 32565df
- [x] Task: Conductor - User Manual Verification 'Phase 1: Model Fetching Logic' (Protocol in workflow.md)

## Phase 2: Settings Dialog Integration [checkpoint: f1198bb]
- [x] Task: Update `SettingsDialog` state to manage model lists, loading status, and errors for each provider 6558257
- [x] Task: Update `SettingsDialog` UI to include `<datalist>` elements for model inputs f1198bb
- [x] Task: Add manual refresh button and loading/error indicators to the model input rows f1198bb
- [x] Task: Implement automatic fetching logic on configuration changes (sl-blur/save) f1198bb
- [x] Task: Conductor - User Manual Verification 'Phase 2: Settings Dialog Integration' (Protocol in workflow.md)

## Phase 3: Verification and Polishing
- [x] Task: Verify that manual model ID entry still works (datalist behavior) f1198bb
- [x] Task: Ensure errors are handled gracefully and don't block other setting operations f1198bb
- [x] Task: Run full test suite and verify no regressions 183f97b (Unit tests passed; E2E skipped due to env)
- [~] Task: Conductor - User Manual Verification 'Phase 3: Verification and Polishing' (Protocol in workflow.md)
