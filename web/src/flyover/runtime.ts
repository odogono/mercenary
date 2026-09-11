import {
  resetFlyoverCamera,
  type FlyoverCameraState,
  type FlyoverViewport
} from './camera.ts';
import type { FlyoverBody, FlyoverSystem } from './system.ts';

export interface FlyoverReset {
  readonly bodies: readonly FlyoverBody[];
  readonly camera: FlyoverCameraState;
}

/// Restore every reload-local authority the Flyover owns. Shell controls call this as one
/// operation so the overview Pose and moving Targ Bodies always describe the same epoch.
export const resetFlyover = (
  system: FlyoverSystem,
  viewport: FlyoverViewport
): FlyoverReset => {
  if (system.systemId === 'targ') {
    system.clock.reset();
  }
  const bodies = system.bodiesAt(0);
  return {
    bodies,
    camera: resetFlyoverCamera(bodies, system.camera, viewport)
  };
};
