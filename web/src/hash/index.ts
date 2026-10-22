/// SHA-256 as lowercase hex, through the WebCrypto API the browser and Bun share.
export const sha256 = async (
  text: string | Uint8Array | ArrayBuffer
): Promise<string> => {
  const bytes =
    typeof text === 'string'
      ? new TextEncoder().encode(text)
      : new Uint8Array(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};
