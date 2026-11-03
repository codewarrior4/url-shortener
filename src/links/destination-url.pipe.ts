import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { isSafeDestination } from './destination-url.js';

@Injectable()
export class DestinationUrlPipe implements PipeTransform {
  transform<T extends { destination?: unknown }>(value: T): T {
    if (
      value.destination !== undefined &&
      !isSafeDestination(value.destination)
    ) {
      throw new BadRequestException(
        'destination must be an HTTP/HTTPS URL without embedded credentials',
      );
    }
    return value;
  }
}
