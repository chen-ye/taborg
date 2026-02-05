# Specification: Improve Testing Infrastructure and Coverage

## Overview
The goal of this track is to elevate the quality and reliability of the TabOrg codebase by improving unit test coverage and establishing an end-to-end (E2E) testing framework.

## Goals
- **Unit Testing:** Reach >80% coverage for core business logic in `services/` and `utils/`.
- **E2E Testing:** Implement a Playwright-based testing suite to verify critical user flows in the extension sidepanel.
- **Infrastructure:** Standardize test utilities and patterns across the monorepo.

## Scope
- Audit existing tests in `services/tabs/tab-store.test.ts` and `tests/`.
- Add unit tests for `services/ai/`, `services/mcp/`, and `utils/`.
- Scaffold and implement E2E tests for:
    - Initializing the sidepanel.
    - Selecting and grouping tabs.
    - Triggering AI suggestions.
- Integrate linting and type-checking into the test workflow.

## Technical Considerations
- **Unit Tests:** Continue using Vitest as the primary runner.
- **E2E Tests:** Utilize Playwright with `@pw-extension-kit` or similar to handle Chrome Extension context.
- **Coverage:** Use Vitest's built-in coverage reporting (v8 or c8).
