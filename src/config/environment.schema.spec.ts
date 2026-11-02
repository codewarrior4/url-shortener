import { environmentSchema } from './environment.schema.js';

describe('environmentSchema', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://test_user:test_password@localhost:5432/url_shortener_test',
  };

  it('provides development and port defaults', () => {
    const { error, value } = environmentSchema.validate(validEnvironment);

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
  });

  it('converts an environment port string into a number', () => {
    const { error, value } = environmentSchema.validate({
      ...validEnvironment,
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(8080);
    expect(value.NODE_ENV).toBe('production');
  });

  it.each(['postgres', 'postgresql'])('accepts the %s scheme', (scheme) => {
    const { error } = environmentSchema.validate({
      DATABASE_URL: `${scheme}://user:password@localhost:5432/shortener`,
    });

    expect(error).toBeUndefined();
  });

  it.each([
    ['missing database URL', {}],
    ['empty database URL', { DATABASE_URL: '' }],
    ['unsupported database scheme', { DATABASE_URL: 'https://example.com' }],
    ['invalid environment', { ...validEnvironment, NODE_ENV: 'staging' }],
    ['zero port', { ...validEnvironment, PORT: '0' }],
    ['port above maximum', { ...validEnvironment, PORT: '65536' }],
    ['fractional port', { ...validEnvironment, PORT: '3000.5' }],
    ['nonnumeric port', { ...validEnvironment, PORT: 'abc' }],
  ])('rejects %s', (_description, environment) => {
    expect(environmentSchema.validate(environment).error).toBeDefined();
  });
});
