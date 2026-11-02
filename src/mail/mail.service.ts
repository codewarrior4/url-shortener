import { MailTemplateService } from './mail-template.service.js';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly templates: MailTemplateService,
  ) {}
  async sendToken(
    email: string,
    purpose: 'verify' | 'reset',
    token: string,
  ): Promise<void> {
    const url = new URL(
      purpose === 'verify' ? '/verify-email' : '/reset-password',
      this.config.getOrThrow<string>('APP_URL'),
    );
    url.hash = new URLSearchParams({ token }).toString();
    const transport = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.getOrThrow<number>('SMTP_PORT'),
      secure: this.config.get<number>('SMTP_PORT') === 465,
      requireTLS: true,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transport.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: email,
        ...this.templates.render(purpose, url.toString()),
      });
    } catch {
      // Never log credentials, raw tokens or reset URLs.
      this.logger.error(
        'Authentication email delivery failed; notification job may retry.',
      );
      throw new Error('Email delivery failed');
    } finally {
      transport.close();
    }
  }
}
