import { MailTemplateService } from './mail-template.service.js';
describe('Mail templates', () => {
  const templates = new MailTemplateService();
  it.each(['verify', 'reset'] as const)(
    'renders the %s body inside a common layout with text alternative',
    (purpose) => {
      const url = 'https://example.com/action#token=abc';
      const result = templates.render(purpose, url);
      expect(result.html).toContain('<!doctype html>');
      expect(result.html).toContain('URL Shortener');
      expect(result.html).toContain('If you did not request this email');
      const href = /href="([^"]+)"/.exec(result.html)?.[1];
      expect(href?.replaceAll('&#x3D;', '=')).toBe(url);
      expect(result.html).toContain(
        purpose === 'verify' ? '24 hours' : '30 minutes',
      );
      expect(result.text).toContain(url);
    },
  );
  it('escapes context values instead of executing injected markup', () => {
    const result = templates.render(
      'verify',
      'https://example.com/" onclick="alert(1)',
    );
    expect(result.html).not.toContain('onclick="alert');
    expect(result.html).toContain('&quot;');
  });
});
