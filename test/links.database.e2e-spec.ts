import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { databaseOptions } from '../src/database/database.options.js';
import { User } from '../src/auth/user.entity.js';
import { Link } from '../src/links/link.entity.js';
import { LinksService } from '../src/links/links.service.js';
import { ShortCodeGenerator } from '../src/links/short-code.generator.js';

describe('LinksService with PostgreSQL', () => {
  let module: TestingModule;
  let db: DataSource;
  let service: LinksService;
  let owner: User;
  let other: User;
  const emails: string[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(databaseOptions(process.env.DATABASE_URL!)),
        TypeOrmModule.forFeature([Link]),
      ],
      providers: [LinksService, ShortCodeGenerator],
    }).compile();
    await module.init();
    db = module.get(DataSource);
    service = module.get(LinksService);
    for (let i = 0; i < 2; i++) {
      const email = `links-${randomUUID()}@example.com`;
      emails.push(email);
      const user = await db.getRepository(User).save({
        email,
        passwordHash: 'not-used-for-login',
        verifiedAt: null,
      });
      if (i === 0) owner = user;
      else other = user;
    }
  });

  beforeEach(async () => {
    await db.getRepository(Link).delete({ userId: owner.id });
    await db.getRepository(Link).delete({ userId: other.id });
  });

  afterAll(async () => {
    if (db && emails.length) {
      await db
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('email IN (:...emails)', { emails })
        .execute();
    }
    await module?.close();
  });

  it('paginates only the owner links in stable newest-first order', async () => {
    const first = await service.create(owner.id, 'https://example.com/first');
    const second = await service.create(owner.id, 'https://example.com/second');
    const third = await service.create(owner.id, 'https://example.com/third');
    await service.create(other.id, 'https://example.com/private');
    const page1 = await service.list(owner.id, {
      path: '/links',
      page: 1,
      limit: 2,
    });
    const page2 = await service.list(owner.id, {
      path: '/links',
      page: 2,
      limit: 2,
    });
    expect(page1.data.map((link) => link.id)).toEqual([third.id, second.id]);
    expect(page2.data.map((link) => link.id)).toEqual([first.id]);
    expect(page1.meta).toMatchObject({
      currentPage: 1,
      itemsPerPage: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(page1.links.next).toContain('page=2');
  });

  it('returns defaults and empty data for an empty list or a page beyond the end', async () => {
    const empty = await service.list(owner.id, { path: '/links' });
    expect(empty.data).toEqual([]);
    expect(empty.meta).toMatchObject({
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: 0,
      totalPages: 0,
    });
    await service.create(owner.id, 'https://example.com');
    const result = await service.list(owner.id, {
      path: '/links',
      page: 5,
      limit: 20,
    });
    expect(result.data).toEqual([]);
    expect(result.meta.totalItems).toBe(1);
  });

  it('caps page size at 100 using the package configuration', async () => {
    const result = await service.list(owner.id, { path: '/links', limit: 500 });
    expect(result.meta.itemsPerPage).toBe(100);
  });

  it('does not allow query filters to override the authenticated owner', async () => {
    const own = await service.create(owner.id, 'https://example.com/own');
    await service.create(other.id, 'https://example.com/private');
    const result = await service.list(owner.id, {
      path: '/links',
      filter: { userId: `$eq:${other.id}` },
    });
    expect(result.data.map((link) => link.id)).toEqual([own.id]);
    expect(result.meta.totalItems).toBe(1);
  });

  it('updates the destination while preserving code, owner and creation time', async () => {
    const original = await service.create(owner.id, 'https://example.com/old');
    const updated = await service.update(
      owner.id,
      original.id,
      'https://example.com/new',
    );
    expect(updated).toMatchObject({
      id: original.id,
      userId: owner.id,
      code: original.code,
      destination: 'https://example.com/new',
      createdAt: original.createdAt,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      original.updatedAt.getTime(),
    );
    expect(
      (await db.getRepository(Link).findOneByOrFail({ id: original.id }))
        .destination,
    ).toBe('https://example.com/new');
  });

  it('rejects an update from another owner without changing the record', async () => {
    const link = await service.create(owner.id, 'https://example.com/original');
    await expect(
      service.update(other.id, link.id, 'https://example.com/changed'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await db.getRepository(Link).findOneByOrFail({ id: link.id }))
        .destination,
    ).toBe(link.destination);
  });

  it('allows an owner to delete and rejects another owner', async () => {
    const link = await service.create(owner.id, 'https://example.com');
    await expect(service.delete(other.id, link.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await db.getRepository(Link).existsBy({ id: link.id })).toBe(true);
    await service.delete(owner.id, link.id);
    expect(await db.getRepository(Link).existsBy({ id: link.id })).toBe(false);
    await expect(service.delete(owner.id, link.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(owner.id, link.id, 'https://example.com/new'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
