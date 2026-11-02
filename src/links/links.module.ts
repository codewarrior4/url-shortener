import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './link.entity.js';
import { LinksService } from './links.service.js';
import { ShortCodeGenerator } from './short-code.generator.js';

@Module({
  imports: [TypeOrmModule.forFeature([Link])],
  providers: [LinksService, ShortCodeGenerator],
})
export class LinksModule {}
