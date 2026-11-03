export const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED_ALIASES = new Set([
  'auth',
  'links',
  'verify-email',
  'reset-password',
  'health',
  'admin',
]);

export function isReservedAlias(alias: string): boolean {
  return RESERVED_ALIASES.has(alias.toLowerCase());
}
