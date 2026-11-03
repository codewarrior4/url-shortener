import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './link.entity.js';
import { LinksService } from './links.service.js';
import { ShortCodeGenerator } from './short-code.generator.js';
import { AuthModule } from '../auth/auth.module.js';
import { LinksController } from './links.controller.js';
import { RedirectController } from './redirect.controller.js';
import { AdminLinksController } from './admin-links.controller.js';
import { DestinationUrlPipe } from './destination-url.pipe.js';

@Module({
  imports: [TypeOrmModule.forFeature([Link]), AuthModule],
  controllers: [LinksController, AdminLinksController, RedirectController],
  providers: [LinksService, ShortCodeGenerator, DestinationUrlPipe],
})
export class LinksModule {}
