import { BadRequestException } from '@nestjs/common';
import { DestinationUrlPipe } from './destination-url.pipe.js';

describe('DestinationUrlPipe', () => {
  const pipe = new DestinationUrlPipe();
  it('preserves a valid URL and the other DTO fields', () => {
    const dto = {
      destination: 'https://example.com/path?q=1#section',
      isEnabled: false,
    };
    expect(pipe.transform(dto)).toBe(dto);
  });
  it('allows lifecycle-only updates without a destination', () => {
    const dto = { destination: undefined, isEnabled: false };
    expect(pipe.transform(dto)).toBe(dto);
  });
  it.each([
    'javascript:alert(1)',
    '//example.com',
    'ftp://example.com',
    'https://user:password@example.com',
    null,
    123,
  ])('rejects invalid destination %s', (destination) => {
    expect(() => pipe.transform({ destination })).toThrow(BadRequestException);
  });
});
