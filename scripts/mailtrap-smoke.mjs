import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
loadEnvFile('.env');
if (process.env.SMTP_HOST !== 'sandbox.smtp.mailtrap.io') throw new Error('Smoke test requires the Mailtrap Sandbox SMTP host');
const { NestFactory } = await import('@nestjs/core');
const { DataSource } = await import('typeorm');
const { AppModule } = await import('../dist/app.module.js');
const { AuthService } = await import('../dist/auth/auth.service.js');
const { MailService } = await import('../dist/mail/mail.service.js');
const { User } = await import('../dist/auth/user.entity.js');
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
const auth = app.get(AuthService);
const mail = app.get(MailService);
const db = app.get(DataSource);
const address = `mailtrap-smoke-${randomUUID()}@example.com`;
const sent = [];
async function delivered(count) {
  const deadline = Date.now() + 45000;
  while (sent.length < count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  if (sent.length !== count) throw new Error('Queued Mailtrap delivery did not complete within 45 seconds');
}
const original = mail.sendToken.bind(mail);
mail.sendToken = async (email, purpose, token) => {
  await original(email, purpose, token);
  sent.push({ purpose, token });
};
try {
  const password = randomUUID() + randomUUID();
  await auth.register(address, password);
  await delivered(1);
  await auth.consume(sent[0].token, 'verify');
  const session = await auth.login(address, password);
  await auth.requestEmail(address, 'reset');
  await delivered(2);
  const replacement = randomUUID() + randomUUID();
  await auth.consume(sent[1].token, 'reset', replacement);
  await auth.login(address, replacement);
  let revoked = false;
  try { await auth.refresh(session.refreshToken); } catch { revoked = true; }
  if (!revoked) throw new Error('Reset did not revoke old session');
  console.log('Event listeners and BullMQ delivered verification and reset emails accepted by Mailtrap SMTP. Verification, password reset, new login and old-session revocation passed. Inspect your Sandbox inbox to confirm rendering.');
} finally {
  await db.getRepository(User).delete({ email: address });
  await app.close();
}
