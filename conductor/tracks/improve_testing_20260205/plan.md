# Implementation Plan: Improve Testing Infrastructure and Coverage

## Phase 1: Audit and Unit Test Foundation
- [ ] Task: Audit current test coverage and identify gaps in `services/` and `utils/`.
- [ ] Task: Improve unit tests for `services/tabs/tab-store.ts`.
    - [ ] Write tests for edge cases in tab grouping.
    - [ ] Write tests for persistence logic.
- [ ] Task: Implement unit tests for `utils/ai-schemas.ts` and `utils/url-utils.ts`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Audit and Unit Test Foundation' (Protocol in workflow.md)

## Phase 2: AI and Service Testing
- [ ] Task: Implement unit tests for `services/ai/`.
    - [ ] Mock Chrome AI (Prompt API) responses.
    - [ ] Mock Google Gemini API interactions.
- [ ] Task: Implement unit tests for `services/mcp/` connection logic.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: AI and Service Testing' (Protocol in workflow.md)

## Phase 3: E2E Testing Framework
- [ ] Task: Configure Playwright for Chrome Extension E2E testing.
    - [ ] Set up `playwright.config.ts`.
    - [ ] Create E2E test utilities for extension loading.
- [ ] Task: Implement E2E test for the Sidepanel hierarchy view.
- [ ] Task: Implement E2E test for basic Tab Selection and Manual Grouping.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: E2E Testing Framework' (Protocol in workflow.md)

## Phase 4: Verification and Finalization
- [ ] Task: Run full test suite and verify >80% coverage across target directories.
- [ ] Task: Ensure all tests pass linting and type-checking (`yarn lint` and `yarn compile`).
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Verification and Finalization' (Protocol in workflow.md)
