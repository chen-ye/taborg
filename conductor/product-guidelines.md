# Product Guidelines

## Prose & Communication
- **Style:** Professional, concise, and technical. Prioritize speed and clarity. Use precise terminology that accurately reflects browser and AI states.
- **Tone:** Direct and helpful. Avoid conversational filler.

## User Feedback & Errors
- **Actionable Notifications:** Use toast notifications for general system status and errors, providing "retry" or "fix" actions where applicable.
- **Inline Feedback:** For specific configuration fields (e.g., API keys, settings), provide immediate validation and feedback directly within the UI.
- **Empty States:** Utilize empty states in the sidepanel and panes to provide clear instructions on how to begin workflows (e.g., "Select tabs to start organizing").

## AI Content Guidelines
- **Frictionless Generation:** AI should provide ambient suggestions (e.g., window naming) that the user can observe and manually override without interrupting their flow.
- **Human-in-the-loop (Groups):** For more persistent state like group descriptions, AI suggestions should be explicitly pushed to the user for approval or editing before being saved.
- **Contextual Derivation:** Generated names and descriptions must be strictly derived from the titles and URLs of the contained tabs and windows.

## Visual Standards
- **Theme Support:** Maintain full support for system light and dark modes.
- **Accessibility:** All UI elements must meet WCAG contrast standards. Never use color alone to convey state.
- **Native Aesthetic:** Leverage Shoelace components to maintain a clean, minimalist design that integrates seamlessly with the Chrome browser's native feel.
