export const destinationUrlOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_valid_protocol: true,
  disallow_auth: true,
};

export const MAX_DESTINATION_LENGTH = 2048;
import { isURL } from 'class-validator';

export function isSafeDestination(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DESTINATION_LENGTH &&
    isURL(value, destinationUrlOptions)
  );
}
