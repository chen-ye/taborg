# Specification: Structured Output Migration (Vercel AI SDK v6+)

## Overview
The Vercel AI SDK has deprecated `generateObject` in favor of using `generateText` with the `output` property for structured data generation. This track audits and migrates the remote LLM strategies (`StandardLLMStrategy` and `BatchedLLMStrategy`) to this new pattern to ensure long-term stability and robust schema enforcement.

## Functional Requirements
1.  **Migration to `generateText` with `output`:**
    -   Update `services/ai/strategies.ts` to replace all calls to `generateObject` with `generateText`.
    -   Utilize the `output` property in `generateText` to enforce structured JSON output using existing Zod schemas.
2.  **Schema Standardization:**
    -   Ensure `CategorizationSchemaType`, `SimilaritySchemaType`, and `WindowNameSchemaType` are correctly used within the new `output` configuration.
3.  **Strict Error Handling:**
    -   Configure the SDK to enforce schema compliance.
    -   If the model fails to produce valid structured output after internal SDK retries, the error must be propagated to the UI.
    -   The UI should display a descriptive toast message informing the user of the AI failure.

## Non-Functional Requirements
-   **Stability:** Avoid deprecated API usage to future-proof the codebase.
-   **Reliability:** Leverage the built-in validation and conforming logic of the Vercel AI SDK.

## Acceptance Criteria
- [ ] `StandardLLMStrategy` uses `generateText({ ..., output: ... })` for all AI actions.
- [ ] `BatchedLLMStrategy` uses `generateText({ ..., output: ... })` for all AI actions.
- [ ] Tab categorization, similarity matching, and window naming continue to function correctly with remote providers (Gemini/OpenAI).
- [ ] Validation errors from the SDK result in clear error messages/toasts in the UI.
- [ ] All unit and E2E tests for remote AI providers pass.

## Out of Scope
-   Updating `ChromeAIService` (on-device AI), which uses a custom message-based implementation.
-   Adding new AI features or models.
