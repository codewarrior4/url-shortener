import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ShortCodeGenerator {
  generate(): string {
    return randomBytes(9).toString('base64url');
  }
}
