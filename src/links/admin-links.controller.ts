import {
  Controller,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../auth/user-role.js';
import { LinksService } from './links.service.js';

@Controller('admin/links')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AdminLinksController {
  constructor(private readonly links: LinksService) {}

  @Patch(':id/disable')
  @Header('Cache-Control', 'no-store')
  async disable(@Param('id', ParseIntPipe) id: number) {
    const link = await this.links.disableForModeration(id);
    return {
      id: link.id,
      code: link.code,
      adminDisabledAt: link.adminDisabledAt,
    };
  }

  @Patch(':id/enable')
  @Header('Cache-Control', 'no-store')
  async enable(@Param('id', ParseIntPipe) id: number) {
    const link = await this.links.enableForModeration(id);
    return {
      id: link.id,
      code: link.code,
      adminDisabledAt: link.adminDisabledAt,
    };
  }
}
