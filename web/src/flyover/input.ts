import { flyoverSpeedKey, type FlyoverControls } from './camera.ts';

const arrows = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export class FlyoverKeyboard {
  private readonly pressed = new Set<string>();

  constructor(
    private readonly speedNotch: () => number,
    private readonly setSpeedNotch: (notch: number) => void
  ) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.shiftKey && event.key !== '+')
    ) {
      return;
    }
    if (arrows.has(event.key)) {
      event.preventDefault();
      this.pressed.add(event.key);
      return;
    }
    if (event.repeat) {
      return;
    }
    const notch = flyoverSpeedKey(event.key, this.speedNotch());
    if (notch !== undefined) {
      event.preventDefault();
      this.setSpeedNotch(notch);
    }
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    if (this.pressed.delete(event.key)) {
      event.preventDefault();
    }
  };

  private readonly visibilityChanged = (): void => {
    if (document.hidden) {
      this.clear();
    }
  };

  readonly clear = (): void => {
    this.pressed.clear();
  };

  controls(): FlyoverControls {
    const yaw =
      Number(this.pressed.has('ArrowLeft')) -
      Number(this.pressed.has('ArrowRight'));
    const pitch =
      Number(this.pressed.has('ArrowUp')) -
      Number(this.pressed.has('ArrowDown'));
    return {
      pitch: Math.sign(pitch) as -1 | 0 | 1,
      yaw: Math.sign(yaw) as -1 | 0 | 1
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.clear();
  }
}
