# Implementation Plan: OpenAI-Compatible LLM Service & Vercel AI SDK Transition

## Phase 1: Dependency Setup & Types
- [x] Task: Install Vercel AI SDK dependencies (838e99c)
    - [ ] Run `yarn add ai @ai-sdk/google @ai-sdk/openai`
- [ ] Task: Update LLM Types and Settings Schema
    - [ ] Update `types/llm-types.ts` to include `openai` provider and model selection fields
    - [ ] Update settings schema/types to include `openaiBaseUrl`, `openaiModelId`, and `geminiModelId`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Setup & Types' (Protocol in workflow.md)

## Phase 2: Provider & Strategy Architecture
- [ ] Task: Implement Provider Factories
    - [ ] Create `services/ai/providers.ts` to instantiate AI SDK `LanguageModel` instances for Google and OpenAI with user-provided config.
- [ ] Task: Create Strategy Base/Interface
    - [ ] Define a clear interface for `categorizeTabs` and other AI actions.
- [ ] Task: Implement `StandardLLMStrategy`
    - [ ] A strategy that handles requests in parallel or single large prompts (suited for Gemini/GPT-4).
- [ ] Task: Implement `BatchedLLMStrategy`
    - [ ] A strategy optimized for smaller models (like Chrome Nano) that handles requests in smaller, controlled batches.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Provider & Strategy Architecture' (Protocol in workflow.md)

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
