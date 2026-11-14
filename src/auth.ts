import { timingSafeEqual } from 'node:crypto';
import type { TokenScope } from './config.js';

/**
 * Resolve an `Authorization: Bearer <token>` header to its scope.
 * Returns null when the header is missing/malformed or the token is unknown.
 */
export function authenticate(
  authorizationHeader: string | undefined,
  tokens: TokenScope[],
): TokenScope | null {
  if (!authorizationHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;

  const provided = Buffer.from(match[1]!.trim(), 'utf8');

  for (const scope of tokens) {
    const expected = Buffer.from(scope.token, 'utf8');
    // Length check first: timingSafeEqual requires equal-length buffers.
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return scope;
    }
  }
  return null;
}
