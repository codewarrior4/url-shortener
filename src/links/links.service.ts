import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { paginate } from 'nestjs-paginate';
import type { PaginateQuery, Paginated } from 'nestjs-paginate';
import { isSafeDestination } from './destination-url.js';
import { Link } from './link.entity.js';
import { ShortCodeGenerator } from './short-code.generator.js';
import { ALIAS_PATTERN, isReservedAlias } from './alias-policy.js';

export type LinkLifecycleInput = {
  expiresAt?: string | null;
  isEnabled?: boolean;
};
export type CreateLinkOptions = LinkLifecycleInput & { alias?: string };
export type UpdateLinkInput = LinkLifecycleInput & { destination?: string };

// The code constraint created by our generated CreateLinks migration.
const CODE_UNIQUE_CONSTRAINT = 'UQ_52a3fa2a2c27a987ed58fd2ea42';
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(Link) private readonly links: Repository<Link>,
    private readonly codes: ShortCodeGenerator,
  ) {}

  private expiration(
    value: string | null | undefined,
  ): Date | null | undefined {
    if (value === undefined || value === null) return value;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be a future date');
    }
    return date;
  }

  async resolve(code: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
      throw new NotFoundException('Link not found');
    }

    const link = await this.links.findOne({
      where: { code, isEnabled: true, adminDisabledAt: IsNull() },
      select: { destination: true, expiresAt: true },
    });

    if (
      !link ||
      (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()) ||
      !isSafeDestination(link.destination)
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

  async disableForModeration(id: number): Promise<Link> {
    const result = await this.links
      .createQueryBuilder()
      .update(Link)
      .set({ adminDisabledAt: new Date() })
      .where({ id })
      .returning('*')
      .execute();
    if (!result.affected) throw new NotFoundException('Link not found');
    return this.links.create(result.raw[0] as Link);
  }

  async enableForModeration(id: number): Promise<Link> {
    const result = await this.links
      .createQueryBuilder()
      .update(Link)
      .set({ adminDisabledAt: null })
      .where({ id })
      .returning('*')
      .execute();
    if (!result.affected) throw new NotFoundException('Link not found');
    return this.links.create(result.raw[0] as Link);
  }

  async update(
    userId: number,
    id: number,
    input: string | UpdateLinkInput,
  ): Promise<Link> {
    const changes = typeof input === 'string' ? { destination: input } : input;
    const patch: Partial<Link> = {};
    if (changes.destination !== undefined)
      patch.destination = changes.destination;
    if (changes.isEnabled !== undefined) patch.isEnabled = changes.isEnabled;
    if (changes.expiresAt !== undefined)
      patch.expiresAt = this.expiration(changes.expiresAt);
    if (!Object.keys(patch).length)
      throw new BadRequestException('Provide at least one field to update');
    // Scope the write itself and return the changed row in the same statement.
    const result = await this.links
      .createQueryBuilder()
      .update(Link)
      .set(patch)
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

  async create(
    userId: number,
    destination: string,
    options: CreateLinkOptions = {},
  ): Promise<Link> {
    if (
      options.alias !== undefined &&
      (!ALIAS_PATTERN.test(options.alias) || isReservedAlias(options.alias))
    ) {
      throw new BadRequestException('Invalid or reserved alias');
    }
    const expiresAt = this.expiration(options.expiresAt) ?? null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = options.alias ?? this.codes.generate();
      if (isReservedAlias(code)) continue;
      const link = this.links.create({
        userId,
        destination,
        code,
        expiresAt,
        isEnabled: options.isEnabled ?? true,
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
        if (options.alias !== undefined)
          throw new ConflictException('Alias is already in use');
      }
    }

    throw new ServiceUnavailableException(
      'Unable to allocate a short code. Please try again.',
    );
  }
}
