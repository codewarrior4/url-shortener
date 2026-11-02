import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { paginate } from 'nestjs-paginate';
import type { PaginateQuery, Paginated } from 'nestjs-paginate';
import { isURL } from 'class-validator';
import {
  destinationUrlOptions,
  MAX_DESTINATION_LENGTH,
} from './destination-url.js';
import { Link } from './link.entity.js';
import { ShortCodeGenerator } from './short-code.generator.js';

// The code constraint created by our generated CreateLinks migration.
const CODE_UNIQUE_CONSTRAINT = 'UQ_52a3fa2a2c27a987ed58fd2ea42';
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(Link) private readonly links: Repository<Link>,
    private readonly codes: ShortCodeGenerator,
  ) {}

  async resolve(code: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
      throw new NotFoundException('Link not found');
    }

    const link = await this.links.findOne({
      where: { code },
      select: { destination: true },
    });

    if (
      !link ||
      link.destination.length > MAX_DESTINATION_LENGTH ||
      !isURL(link.destination, destinationUrlOptions)
    ) {
      throw new NotFoundException('Link not found');
    }

    return link.destination;
  }

  list(userId: number, query: PaginateQuery): Promise<Paginated<Link>> {
    return paginate(query, this.links, {
      where: { userId },
      sortableColumns: ['id'],
      defaultSortBy: [['id', 'DESC']],
      defaultLimit: 20,
      maxLimit: 100,
    });
  }

  async update(userId: number, id: number, destination: string): Promise<Link> {
    // Scope the write itself and return the changed row in the same statement.
    const result = await this.links
      .createQueryBuilder()
      .update(Link)
      .set({ destination })
      .where({ id, userId })
      .returning('*')
      .execute();

    if (!result.affected) throw new NotFoundException('Link not found');
    return this.links.create(result.raw[0] as Link);
  }

  async delete(userId: number, id: number): Promise<void> {
    const result = await this.links.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Link not found');
  }

  async create(userId: number, destination: string): Promise<Link> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const link = this.links.create({
        userId,
        destination,
        code: this.codes.generate(),
      });

      try {
        return await this.links.save(link);
      } catch (error) {
        if (!(error instanceof QueryFailedError)) throw error;
        const driverError = error.driverError as {
          code?: string;
          constraint?: string;
        };
        // Only retry a collision on the code, not foreign-key or other failures.
        if (
          driverError.code !== '23505' ||
          driverError.constraint !== CODE_UNIQUE_CONSTRAINT
        ) {
          throw error;
        }
      }
    }

    throw new ServiceUnavailableException(
      'Unable to allocate a short code. Please try again.',
    );
  }
}
