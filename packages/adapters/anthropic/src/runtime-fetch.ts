/**
 * The fetch handed to the SDK client.
 *
 * - It is the runtime's WHATWG fetch. Without it, the Node-targeted bundle uses the SDK's
 *   node-fetch fallback, which calls the deprecated url.parse() and prints a DEP0169 warning.
 * - globalThis.fetch is resolved per call so test doubles installed on it still apply.
 * - Under Bun, fetch also runs its own idle timer (BUN_CONFIG_HTTP_IDLE_TIMEOUT, 5 minutes by
 *   default). A non-streaming request to a model that thinks longer than that receives no bytes in
 *   the window and fails as a connection error, whatever the adapter's configured timeout.
 *   `timeout: false` turns Bun's timer off, so the SDK's own timeout (its AbortSignal) is the only
 *   limit. Node's fetch has no such timer, so the request passes through unchanged there.
 */

const IS_BUN = typeof globalThis.process?.versions?.bun === 'string';

/** Bun-only fetch option, missing from bun-types' BunFetchRequestInit. */
type BunFetchInit = RequestInit & { timeout: false };

export function runtimeFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Promise<Response> {
  if (!IS_BUN) return globalThis.fetch(input, init);
  const bunInit: BunFetchInit = { ...init, timeout: false };
  return globalThis.fetch(input, bunInit);
}
