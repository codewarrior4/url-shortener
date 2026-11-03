import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Paginate } from 'nestjs-paginate';
import type { PaginateQuery } from 'nestjs-paginate';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { Link } from './link.entity.js';
import { CreateLinkDto, UpdateLinkDto } from './link.dto.js';
import { LinksService } from './links.service.js';

@Controller('links')
@UseGuards(AuthGuard)
export class LinksController {
  constructor(
    private readonly links: LinksService,
    private readonly config: ConfigService,
  ) {}

  private present(link: Link) {
    return {
      id: link.id,
      userId: link.userId,
      destination: link.destination,
      code: link.code,
      expiresAt: link.expiresAt,
      isEnabled: link.isEnabled,
      adminDisabledAt: link.adminDisabledAt,
      shortUrl: new URL(
        `/${link.code}`,
        this.config.getOrThrow<string>('APP_URL'),
      ).toString(),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: AuthRequest, @Body() dto: CreateLinkDto) {
    return this.present(
      await this.links.create(request.auth.userId, dto.destination, dto),
    );
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthRequest, @Paginate() query: PaginateQuery) {
    const result = await this.links.list(request.auth.userId, query);
    return {
      data: result.data.map((link) => this.present(link)),
      meta: result.meta,
      links: result.links,
    };
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async update(
    @Req() request: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.present(await this.links.update(request.auth.userId, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async delete(
    @Req() request: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.links.delete(request.auth.userId, id);
  }
}
