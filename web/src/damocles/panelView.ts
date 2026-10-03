import type { PanelViewModel } from '../shell/panel.ts';
import { panelRgba } from '../shell/panelPixels.ts';
import type { DamoclesPanelDocument } from './panelDocument.ts';
import { drawDamoclesPanel, type DamoclesPanelView } from './panelWriter.ts';

/// Present the recovered panel once, with semantic readouts beside the canvas.
/// No authored chrome is painted by this path; pointer hit regions overlay the
/// recovered inventory and centre windows in their native 320-by-64 geometry.
export const installRecoveredDamoclesPanel = (
  root: HTMLElement,
  doc: DamoclesPanelDocument
): { draw(view: DamoclesPanelView, accessible: PanelViewModel): void } => {
  const canvas = root.querySelector<HTMLCanvasElement>(
    '#damocles-panel-canvas'
  )!;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(320, 64);
  const centre = root.querySelector<HTMLCanvasElement>(
    '#damocles-centre-canvas'
  )!;
  const fields = root.querySelectorAll<HTMLElement>('[data-field]');
  const lamps = root.querySelectorAll<HTMLElement>('[data-lamp]');
  const actions = root.querySelector<HTMLElement>('#damocles-centre-actions')!;
  const parameter = root.querySelector<HTMLButtonElement>(
    '[data-command=parameter]'
  )!;
  root.dataset['provenance'] = 'recovered-artwork-title-specific-writers';
  return {
    draw(view, accessible): void {
      panelRgba(drawDamoclesPanel(doc, view), image.data);
      context.putImageData(image, 0, 0);
      for (const element of fields) {
        const name = element.dataset['field'] as keyof PanelViewModel;
        const value =
          name === 'message'
            ? view.message.cells.trimEnd()
            : String(accessible[name] ?? '');
        if (name === 'inventory') {
          element.setAttribute(
            'aria-label',
            `Open the carried head: ${accessible.inventory}`
          );
        }
        if (name === 'locationLabel' && accessible.locationAxes !== undefined) {
          const key = JSON.stringify(accessible.locationAxes);
          if (element.dataset['axes'] !== key) {
            element.dataset['axes'] = key;
            element.replaceChildren(
              ...accessible.locationAxes.flatMap((axis, index) => {
                const span = document.createElement('span');
                span.className = 'location-axis';
                span.dataset['negative'] = String(axis.negative);
                span.textContent = axis.text;
                span.setAttribute(
                  'aria-label',
                  `${axis.negative ? 'negative ' : ''}${axis.text}`
                );
                return index === 0
                  ? [span]
                  : [document.createTextNode('-'), span];
              })
            );
          }
          continue;
        }
        if (element.textContent !== value) {
          element.textContent = value;
        }
      }
      for (const element of lamps) {
        const name = element.dataset['lamp'] as keyof PanelViewModel;
        const on = accessible[name] === true;
        element.classList.toggle('on', on);
        const text = `${name}: ${on ? 'on' : 'off'}. `;
        if (element.textContent !== text) {
          element.textContent = text;
        }
      }
      const panel = accessible.centreBox?.panel;
      const resting = view.centre.steps === 0 && view.centre.from === null;
      centre.hidden = resting;
      centre.dataset['panel'] = panel?.title ?? '';
      centre.dataset['item'] = panel?.item ?? '';
      centre.dataset['provenance'] =
        panel?.kind === 'document' || panel == null
          ? 'recovered'
          : 'recovered-art-authored-content-layout';
      centre.setAttribute(
        'aria-label',
        panel == null
          ? 'Damocles logo'
          : `${panel.title}: ${panel.item ?? 'opening'}. Read or activate item`
      );
      actions.hidden = resting;
      parameter.hidden = panel?.kind !== 'computer';
      root.dataset['navigationProvenance'] = 'body-derived-space-placeholder';
      root.dataset['gaugeProvenance'] = 'authored-temperature-power';
      root.dataset['gridFontProvenance'] = 'authored';
    }
  };
};
