# Implementation Plan: Declarative AI Configuration & Reliability Refactor

## Phase 1: Infrastructure & Settings [checkpoint: 32406b7]
- [x] Task: Update LLM Types (58248c2)
    - [ ] Add `LLMStrategyType` ('default' | 'standard' | 'batched') to `types/llm-types.ts`
    - [ ] Add `strategyOverride` to `LLMModelConfig`
- [x] Task: Update Settings UI (2bf4603)
    - [ ] Add "LLM Strategy" dropdown to `components/settings-dialog.ts` (options: Default, Standard, Batched)
    - [ ] Map dropdown to `llm-strategy-override` sync storage key
- [x] Task: Conductor - User Manual Verification 'Phase 1: Infrastructure & Settings' (Protocol in workflow.md)

## Phase 2: Strategy & Provider Improvements [checkpoint: dea87db]
- [x] Task: Standardize `StandardLLMStrategy` Prompts (f4d58c8)
    - [ ] Update `services/ai/strategies.ts` to use `JSON.stringify` for tab data in the standard strategy
- [x] Task: Relax OpenAI Key Constraint (f4d58c8)
    - [ ] Update `services/ai/providers.ts` to allow empty API keys if a `openaiBaseUrl` is present
- [x] Task: Create Declarative Config (f4d58c8)
    - [ ] Create `services/ai/provider-config.ts` defining the mapping between providers and their instantiation logic (model getter + default strategy)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Strategy & Provider Improvements' (Protocol in workflow.md)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Strategy & Provider Improvements' (Protocol in workflow.md)

## Phase 3: LLMManager Core Refactor
- [ ] Task: Rewrite `LLMManager.loadSettings`
    - [ ] Implement logical nullish assignment (`??=`) to prevent overwriting updates from concurrent listeners
- [ ] Task: Implement Active Service Caching
    - [ ] Update `LLMManager` to cache the current `LLMService` instance
    - [ ] Implement logic to invalidate/re-instantiate the cache only when provider-relevant settings change
- [ ] Task: Refactor `LLMManager.getService`
    - [ ] Use the declarative configuration from `provider-config.ts` to build the active service
    - [ ] Apply the user's strategy override if present and compatible
- [ ] Task: Conductor - User Manual Verification 'Phase 3: LLMManager Core Refactor' (Protocol in workflow.md)

## Phase 4: Verification
- [ ] Task: Update Unit Tests
    - [ ] Update `services/ai/llm-manager.test.ts` to verify caching and override behavior
    - [ ] Verify `providers.test.ts` for relaxed OpenAI key constraints
- [ ] Task: Final Verification
    - [ ] Run full unit test suite (`yarn test:unit`)
    - [ ] Run E2E tests (`yarn test:e2e`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Verification' (Protocol in workflow.md)
