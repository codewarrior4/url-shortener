import { Controller, Get, Header, Param, Redirect } from '@nestjs/common';
import { LinksService } from './links.service.js';

@Controller()
export class RedirectController {
  constructor(private readonly links: LinksService) {}

  @Get(':code')
  @Redirect(undefined, 302)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async follow(@Param('code') code: string) {
    return { url: await this.links.resolve(code) };
  }
}
