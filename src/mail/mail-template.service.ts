import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import type { AuthEmailPurpose } from '../notifications/auth-email.event.js';
@Injectable()
export class MailTemplateService {
  private readonly engine = Handlebars.create();
  private readonly layout;
  private readonly bodies;
  constructor() {
    const read = (file: string) =>
      readFileSync(new URL(`./templates/${file}`, import.meta.url), 'utf8');
    for (const name of ['header', 'footer'])
      this.engine.registerPartial(name, read(`partials/${name}.hbs`));
    this.layout = this.engine.compile(read('layout.hbs'), { strict: true });
    this.bodies = {
      verify: this.engine.compile(read('verify.hbs'), { strict: true }),
      reset: this.engine.compile(read('reset.hbs'), { strict: true }),
    };
  }
  render(purpose: AuthEmailPurpose, url: string) {
    const subject =
      purpose === 'verify' ? 'Verify your email' : 'Reset your password';
    const context = {
      subject,
      url,
      year: new Date().getFullYear(),
      expires: purpose === 'verify' ? '24 hours' : '30 minutes',
    };
    // Only our rendered template HTML is inserted unescaped. Context values remain escaped.
    return {
      subject,
      html: this.layout({ ...context, body: this.bodies[purpose](context) }),
      text: `${subject}\n\n${purpose === 'verify' ? 'Confirm your email address' : 'Choose a new password'}: ${url}\n\nThis link expires in ${context.expires} and can only be used once. If you did not request this, ignore this email.`,
    };
  }
}
