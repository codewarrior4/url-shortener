import { AuthPagesController } from './auth-pages.controller.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { NotificationModule } from '../notifications/notification.module.js';
@Module({
  imports: [JwtModule.register({}), NotificationModule],
  controllers: [AuthController, AuthPagesController],
  providers: [AuthService, AuthGuard, RolesGuard],
  exports: [AuthGuard, AuthService, RolesGuard],
})
export class AuthModule {}
