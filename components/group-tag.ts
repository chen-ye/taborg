import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@shoelace-style/shoelace/dist/components/tag/tag.js';

@customElement('group-tag')
export class GroupTag extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
    }

    sl-tag {
      cursor: pointer;

      &::part(base) {
        gap: var(--sl-spacing-3x-small);
        background-color: var(--tag-bg);
        color: var(--tag-color);
        border-color: var(--tag-border);
      }
    }

    sl-tag:hover {
      opacity: 0.8;
    }
  `;

  @property({ type: String }) color = 'grey';
  @property({ type: String }) size: 'small' | 'medium' | 'large' = 'small';
  @property({ type: Boolean }) pill = true;

  render() {
    return html`
      <sl-tag
        size=${this.size}
        ?pill=${this.pill}
        style=${this.getTagStyles(this.color)}
      >
        <slot></slot>
      </sl-tag>
    `;
  }

  private getTagStyles(color?: string) {
    if (!color) {
      return `
        --tag-bg: var(--sl-color-neutral-50);
        --tag-color: var(--sl-color-neutral-700);
        --tag-border: var(--sl-color-neutral-200);
      `;
    }

    const shoelaceColor = color === 'grey' ? 'gray' : color;
    return `
      --tag-bg: var(--sl-color-${shoelaceColor}-50);
      --tag-color: var(--sl-color-${shoelaceColor}-700);
      --tag-border: var(--sl-color-${shoelaceColor}-200);
    `;
  }
}
