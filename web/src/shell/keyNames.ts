/// The printed key of the player's keyboard layout for a physical `KeyboardEvent.code` (#606).
///
/// The Control Profile dispatches physical codes, so a Binding's key is the same key on every
/// layout, but its name is not: on AZERTY `Comma` prints `;` and `KeyM` sits where QWERTY's `,`
/// does. A name the layout does not give, or one the panel's typefaces cannot draw, is
/// `undefined`, and the caller falls back to the code's US name.
export interface KeyNames {
  printed(code: string): string | undefined;
}

/// The part of the Keyboard Map API this reads. Only Chromium has it.
export interface KeyboardLayoutSource {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

/// No layout: every key is named by its US name.
export const US_KEY_NAMES: KeyNames = { printed: () => undefined };

// The panel's typefaces draw printable ASCII only, so a printed `ü` or `ç` cannot be shown.
const drawable = (name: string): boolean => /^[!-~]$/.test(name);

/// Name keys as `layout` prints them, upper-cased as the panel names letters.
export const layoutKeyNames = (
  layout: ReadonlyMap<string, string>
): KeyNames => ({
  printed: code => {
    const name = layout.get(code)?.toUpperCase();
    return name !== undefined && drawable(name) ? name : undefined;
  }
});

/// Key names that start as the US names and become the layout's once `keyboard` answers. The
/// map is read once: the Controls Page and the Head Command notice are drawn well after boot.
/// A browser without the API, or a frame the `keyboard-map` policy denies, keeps the US names.
export const readKeyNames = (
  keyboard: KeyboardLayoutSource | undefined
): KeyNames & { readonly ready: Promise<void> } => {
  let names = US_KEY_NAMES;
  const ready = (async () => {
    try {
      const layout = await keyboard?.getLayoutMap();
      if (layout !== undefined) {
        names = layoutKeyNames(layout);
      }
    } catch {
      // Keep the US names.
    }
  })();
  return { printed: code => names.printed(code), ready };
};

/// The browser's key names. `navigator.keyboard` is not in the DOM typings, being Chromium's.
export const browserKeyNames = (): KeyNames =>
  readKeyNames(
    (globalThis.navigator as { keyboard?: KeyboardLayoutSource } | undefined)
      ?.keyboard
  );
