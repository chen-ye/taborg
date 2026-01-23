import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';

export const toast = {
  show(
    message: string,
    variant: 'primary' | 'success' | 'neutral' | 'warning' | 'danger' = 'primary',
    iconName: string = 'info-circle',
    duration: number = 3000,
  ) {
    const alert = Object.assign(document.createElement('sl-alert'), {
      variant,
      closable: true,
      duration,
      innerHTML: `
        <sl-icon slot="icon" name="${iconName}"></sl-icon>
        ${escapeHtml(message)}
      `,
    });

    document.body.append(alert);
    (alert as any).toast();
  },

  error(message: string) {
    this.show(message, 'danger', 'exclamation-octagon');
  },

  success(message: string) {
    this.show(message, 'success', 'check2-circle');
  },
};

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
