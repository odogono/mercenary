/// Something a Benson Script asks the host to do, which is not just a change to host state.
export type BensonEffect =
  | { readonly displaySource: string; readonly playMessage: string }
  | 'keyAcknowledged'
  | { readonly sound: { readonly symbol: string; readonly value: number } }
  | { readonly cityLocationChanged: number }
  | 'scriptFinished';
