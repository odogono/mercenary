import type { PanelViewModel } from './panel.ts';
import type { TargPanelDocument } from './targPanelDocument.ts';
import {
  drawTargPanel,
  targPanelReadouts,
  targPanelRgba
} from './targPanelWriter.ts';

/// Pixel canvas beside the semantic readouts. Cache presentation inputs, so a
/// stationary panel does no pixel allocation on the session's animation frames.
export const installTargPanel = (
  canvas: HTMLCanvasElement,
  doc: TargPanelDocument
): { readonly draw: (model: PanelViewModel) => void } => {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Targ panel requires a 2D canvas');
  }
  const image = context.createImageData(320, 64);
  let previous = '';
  return {
    draw: model => {
      const view = targPanelReadouts(model);
      const key = JSON.stringify(view);
      if (key === previous) {
        return;
      }
      previous = key;
      targPanelRgba(drawTargPanel(doc, view), image.data, view.messageColour);
      context.putImageData(image, 0, 0);
    }
  };
};
