import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuthEmailEvent, AUTH_EMAIL_EVENTS } from './auth-email.event.js';
import { NotificationService } from './notification.service.js';
@Injectable()
export class AuthNotificationListener {
  constructor(private readonly notifications: NotificationService) {}
  @OnEvent(AUTH_EMAIL_EVENTS.registered, { suppressErrors: false })
  @OnEvent(AUTH_EMAIL_EVENTS.verification, { suppressErrors: false })
  @OnEvent(AUTH_EMAIL_EVENTS.reset, { suppressErrors: false })
  async handle(event: AuthEmailEvent): Promise<void> {
    await this.notifications.enqueue(event);
  }
}
