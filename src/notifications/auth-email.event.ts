export type AuthEmailPurpose = 'verify' | 'reset';
export class AuthEmailEvent {
  constructor(
    public readonly email: string,
    public readonly purpose: AuthEmailPurpose,
    public readonly token: string,
  ) {}
}
export const AUTH_EMAIL_EVENTS = {
  registered: 'auth.registered',
  verification: 'auth.verification.requested',
  reset: 'auth.password-reset.requested',
} as const;
