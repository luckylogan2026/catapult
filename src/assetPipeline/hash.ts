// Content addressing: the asset id is the sha-256 of the original bytes.
// Importing the same file twice stores it once, and Phase 6 sync uses the
// hash to skip unchanged uploads.
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
