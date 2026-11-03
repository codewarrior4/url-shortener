import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from './user-role.js';

@Roles(UserRole.Admin)
class ExampleController {
  admin(this: void) {}
  @Roles(UserRole.User)
  user(this: void) {}
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (
    role?: UserRole,
    handler = ExampleController.prototype.admin,
  ) =>
    ({
      getClass: () => ExampleController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ auth: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it('permits the required role', () => {
    expect(guard.canActivate(context(UserRole.Admin))).toBe(true);
  });
  it('rejects an authenticated user without the required role', () => {
    expect(() => guard.canActivate(context(UserRole.User))).toThrow(
      ForbiddenException,
    );
  });
  it('requires authentication when roles are specified', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });
  it('allows method roles to override controller roles', () => {
    expect(
      guard.canActivate(
        context(UserRole.User, ExampleController.prototype.user),
      ),
    ).toBe(true);
  });
});
