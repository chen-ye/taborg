import { css } from 'lit';

/**
 * Shared drop target styles for drag-and-drop interactions.
 * Apply by setting the `drop-target` attribute on the host element.
 */
export const dropTargetStyles = css`
  :host([drop-target]) .item-row,
  :host([drop-target]) .group-row,
  :host([drop-target]) .tab-row,
  :host([drop-target]) .window-header {
    background-color: var(--sl-color-primary-50);
    outline: 2px dashed var(--sl-color-primary-500);
    outline-offset: -2px;
  }
`;
