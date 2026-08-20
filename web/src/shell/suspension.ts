export interface VisibilityTarget extends EventTarget {
  readonly hidden: boolean;
}

/// Release held input and timing only when the Browser Shell actually suspends.
///
/// Returning the uninstall callback keeps the adaptation independently testable and lets a
/// future shell with a shorter lifetime remove exactly the listeners it installed.
export const installSuspensionHandlers = (
  windowTarget: EventTarget,
  documentTarget: VisibilityTarget,
  release: () => void
): (() => void) => {
  const visibilityChanged = (): void => {
    if (documentTarget.hidden) {
      release();
    }
  };
  windowTarget.addEventListener('blur', release);
  documentTarget.addEventListener('visibilitychange', visibilityChanged);
  return () => {
    windowTarget.removeEventListener('blur', release);
    documentTarget.removeEventListener('visibilitychange', visibilityChanged);
  };
};
