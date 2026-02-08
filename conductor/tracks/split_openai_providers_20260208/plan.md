# Implementation Plan: Split OpenAI Provider

## Phase 1: Types and Provider Logic (TDD)
- [x] Task: Update `LLMProvider` and `LLMModelConfig` interfaces in `types/llm-types.ts` 3458a96
- [x] Task: Update `getOpenAIModel` and implement `getCustomOpenAIModel` in `services/ai/providers.ts` 20e81fa
    - [x] Create/Update unit tests in `services/ai/providers.test.ts` to verify provider initialization
- [x] Task: Update `PROVIDER_CONFIG` in `services/ai/provider-config.ts` to include `openai-custom` 2132b8c
- [x] Task: Update `LLMManager` in `services/ai/llm-manager.ts` to handle new configuration keys and the `openai-custom` provider d742255
    - [x] Update unit tests in `services/ai/llm-manager.test.ts`
- [~] Task: Conductor - User Manual Verification 'Phase 1: Types and Provider Logic' (Protocol in workflow.md)

## Phase 2: UI Implementation
- [ ] Task: Update `components/settings-dialog.ts` to include the "OpenAI (Custom)" provider option
- [ ] Task: Update visibility logic in `settings-dialog.ts` to show/hide `openaiCustomBaseUrl`, `openaiCustomApiKey`, and `openaiCustomModelId` appropriately
- [ ] Task: Verify settings persistence in `LLMManager` after UI changes
- [ ] Task: Conductor - User Manual Verification 'Phase 2: UI Implementation' (Protocol in workflow.md)

## Phase 3: Final Verification and Cleanup
- [ ] Task: Run full test suite (`npm test`)
- [ ] Task: Manual end-to-end verification of all providers (Chrome AI, Gemini, OpenAI, OpenAI Custom)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Final Verification and Cleanup' (Protocol in workflow.md)
