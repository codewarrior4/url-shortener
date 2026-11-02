import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MailTemplateService } from './mail-template.service.js';
import { MailService } from './mail.service.js';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
describe('MailService', () => {
  const settings = {
    APP_URL: 'http://localhost:3000',
    SMTP_HOST: 'sandbox.smtp.mailtrap.io',
    SMTP_PORT: 2525,
    SMTP_USER: 'sandbox-user',
    SMTP_PASSWORD: 'sandbox-password',
    MAIL_FROM: 'auth@example.com',
  };
  const service = new MailService(
    new ConfigService(settings),
    new MailTemplateService(),
  );
  const sendMail = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'test' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });
  it.each(['verify', 'reset'] as const)(
    'sends a %s link through authenticated SMTP with a fragment token',
    async (purpose) => {
      const token = 'a'.repeat(64);
      await service.sendToken('user@example.com', purpose, token);
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: settings.SMTP_HOST,
          port: 2525,
          requireTLS: true,
          auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD },
        }),
      );
      const message = sendMail.mock.calls[0]![0];
      expect(message.to).toBe('user@example.com');
      expect(message.html).toContain('URL Shortener');
      expect(message.html).toContain('href=');
      expect(message.text).toContain(
        `${purpose === 'verify' ? '/verify-email' : '/reset-password'}#token=${token}`,
      );
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it('does not expose SMTP errors or credentials and closes the transport', async () => {
    sendMail.mockRejectedValueOnce(new Error('private SMTP diagnostic'));
    await expect(
      service.sendToken('user@example.com', 'reset', 'b'.repeat(64)),
    ).rejects.toThrow('Email delivery failed');
    expect(close).toHaveBeenCalledOnce();
  });
});
