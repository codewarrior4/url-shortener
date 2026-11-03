import {
  Body,
  Header,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthRequest } from './auth.guard.js';
import {
  RegisterDto,
  LoginDto,
  EmailDto,
  TokenDto,
  ResetDto,
  ChangePasswordDto,
} from './auth.dto.js';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Header('Cache-Control', 'no-store')
  @Post('register')
  @HttpCode(202)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }
  @Header('Cache-Control', 'no-store')
  @Post('verify-email')
  @HttpCode(200)
  verify(@Body() dto: TokenDto) {
    return this.auth.consume(dto.token, 'verify');
  }
  @Header('Cache-Control', 'no-store')
  @Post('resend-verification')
  @HttpCode(202)
  resend(@Body() dto: EmailDto) {
    return this.auth.requestEmail(dto.email, 'verify');
  }
  @Header('Cache-Control', 'no-store')
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }
  @Header('Cache-Control', 'no-store')
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: TokenDto) {
    return this.auth.refresh(dto.token);
  }
  @Header('Cache-Control', 'no-store')
  @Post('forgot-password')
  @HttpCode(202)
  forgot(@Body() dto: EmailDto) {
    return this.auth.requestEmail(dto.email, 'reset');
  }
  @Header('Cache-Control', 'no-store')
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetDto) {
    return this.auth.consume(dto.token, 'reset', dto.password);
  }
  @Header('Cache-Control', 'no-store')
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest) {
    return this.auth.me(req.auth.userId);
  }
  @Header('Cache-Control', 'no-store')
  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  logout(@Req() req: AuthRequest) {
    return this.auth.logout(req.auth.userId, req.auth.sessionId);
  }
  @Header('Cache-Control', 'no-store')
  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  logoutAll(@Req() req: AuthRequest) {
    return this.auth.logout(req.auth.userId);
  }
  @Header('Cache-Control', 'no-store')
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  change(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(
      req.auth.userId,
      dto.currentPassword,
      dto.password,
    );
  }
}
