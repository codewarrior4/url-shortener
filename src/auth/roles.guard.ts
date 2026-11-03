import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest } from './auth.guard.js';
import { REQUIRED_ROLES } from './roles.decorator.js';
import { UserRole } from './user-role.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.auth) throw new UnauthorizedException();
    if (!roles.includes(request.auth.role))
      throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
