# Implementation Plan: Improve Testing Infrastructure and Coverage

## Phase 1: Audit and Unit Test Foundation [checkpoint: 73f130a]
- [x] Task: Audit current test coverage and identify gaps in `services/` and `utils/`. [checkpoint: audit_done]
- [x] Task: Improve unit tests for `services/tabs/tab-store.ts`. [checkpoint: 59930]
    - [x] Write tests for edge cases in tab grouping.
    - [x] Write tests for persistence logic.
- [x] Task: Implement unit tests for `utils/ai-schemas.ts` and `utils/url-utils.ts`. [checkpoint: 59837]
- [x] Task: Conductor - User Manual Verification 'Phase 1: Audit and Unit Test Foundation' (Protocol in workflow.md)

## Phase 2: AI and Service Testing [checkpoint: c894910]
- [x] Task: Implement unit tests for `services/ai/`. [checkpoint: 049d58a]
    - [x] Mock Chrome AI (Prompt API) responses.
    - [x] Mock Google Gemini API interactions.
- [x] Task: Implement unit tests for `services/mcp/` connection logic. [checkpoint: 049d58a]
- [x] Task: Conductor - User Manual Verification 'Phase 2: AI and Service Testing' (Protocol in workflow.md)

## Phase 3: E2E Testing Framework [checkpoint: e2e_infra_ready]
- [x] Task: Configure Playwright for Chrome Extension E2E testing. [checkpoint: 63984]
    - [x] Set up `playwright.config.ts`.
    - [x] Create E2E test utilities for extension loading.
- [x] Task: Implement E2E test for the Sidepanel hierarchy view. [checkpoint: 64030]
- [x] Task: Implement E2E test for basic Tab Selection and Manual Grouping. [checkpoint: 64030]
- [x] Task: Conductor - User Manual Verification 'Phase 3: E2E Testing Framework' (Protocol in workflow.md)

## Phase 4: Verification and Finalization [checkpoint: 65427]
- [x] Task: Run full test suite and verify >80% coverage across target directories. [checkpoint: 65160]
- [x] Task: Ensure all tests pass linting and type-checking (`yarn lint` and `yarn compile`). [checkpoint: 65427]
- [x] Task: Conductor - User Manual Verification 'Phase 4: Verification and Finalization' (Protocol in workflow.md)
