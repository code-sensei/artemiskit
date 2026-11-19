/**
 * Loopback endpoint detection for hosts that accept local, unmetered targets.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const IPV4_LOOPBACK = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_LOOPBACK = '[::1]';

/**
 * Return true only when `url` is an http(s) endpoint on this machine's loopback
 * interface: `localhost`, any `127.0.0.0/8` address or `[::1]`.
 *
 * Hosts use this before accepting a target that declares
 * `deployment.cost_basis: 'not_applicable'`. The check is syntactic: it reads the
 * WHATWG-normalized hostname (so `127.1` and `[0:0:0:0:0:0:0:1]` are recognized) and
 * never performs DNS resolution. Userinfo, other schemes, the unspecified address
 * `0.0.0.0`, `localhost` subdomains and malformed input are rejected.
 */
export function isLoopbackEndpoint(url: string): boolean {
  if (typeof url !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Malformed input is a negative answer, not an error.
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  if (parsed.username !== '' || parsed.password !== '') return false;

  const hostname = parsed.hostname;
  if (hostname === 'localhost' || hostname === IPV6_LOOPBACK) return true;

  const octets = IPV4_LOOPBACK.exec(hostname);
  if (!octets) return false;
  return octets.slice(1).every((octet) => Number(octet) <= 255);
}
