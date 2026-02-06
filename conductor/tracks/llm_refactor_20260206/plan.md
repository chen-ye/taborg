# Implementation Plan: OpenAI-Compatible LLM Service & Vercel AI SDK Transition

## Phase 1: Dependency Setup & Types [checkpoint: c703ab4]
- [x] Task: Install Vercel AI SDK dependencies (838e99c)
    - [ ] Run `yarn add ai @ai-sdk/google @ai-sdk/openai`
- [x] Task: Update LLM Types and Settings Schema (4903af0)
    - [ ] Update `types/llm-types.ts` to include `openai` provider and model selection fields
    - [ ] Update settings schema/types to include `openaiBaseUrl`, `openaiModelId`, and `geminiModelId`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Dependency Setup & Types' (Protocol in workflow.md) (c703ab4)

## Phase 2: Provider & Strategy Architecture [checkpoint: 809444a]
- [x] Task: Implement Provider Factories (cbe7c0e)
    - [ ] Create `services/ai/providers.ts` to instantiate AI SDK `LanguageModel` instances for Google and OpenAI with user-provided config.
- [x] Task: Create Strategy Base/Interface (4c3a739)
    - [ ] Define a clear interface for `categorizeTabs` and other AI actions.
- [x] Task: Implement `StandardLLMStrategy` (4c3a739)
    - [ ] A strategy that handles requests in parallel or single large prompts (suited for Gemini/GPT-4).
- [x] Task: Implement `BatchedLLMStrategy` (4c3a739)
    - [ ] A strategy optimized for smaller models (like Chrome Nano) that handles requests in smaller, controlled batches.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Provider & Strategy Architecture' (Protocol in workflow.md) (809444a)

## Phase 3: LLMManager Refactor
- [ ] Task: Update LLMManager
    - [ ] Refactor `LLMManager` to select both the `LanguageModel` (Provider) AND the `LLMStrategy` (Batching behavior) based on the user's selected model/provider.
    - [ ] Update `llm-manager.test.ts` to verify correct strategy selection.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: LLMManager Refactor' (Protocol in workflow.md)

## Phase 4: UI Integration
- [ ] Task: Update Settings UI
    - [ ] Update `components/settings-dialog.ts` to include fields for Gemini Model ID, OpenAI Base URL, API Key, and Model ID.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: UI Integration' (Protocol in workflow.md)

## Phase 5: Final Verification
- [ ] Task: Run full test suite (`yarn test`)
- [ ] Task: E2E Verification of grouping with Chrome Nano (Batched) vs Gemini/OpenAI (Standard).
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Final Verification' (Protocol in workflow.md)
