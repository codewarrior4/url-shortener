import { SetMetadata } from '@nestjs/common';
import { UserRole } from './user-role.js';

export const REQUIRED_ROLES = 'required-roles';
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
