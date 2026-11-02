import { ServiceUnavailableException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { Link } from './link.entity.js';
import { LinksService } from './links.service.js';
import { ShortCodeGenerator } from './short-code.generator.js';

describe('LinksService', () => {
  const create = vi.fn((data: Partial<Link>) =>
    Object.assign(new Link(), data),
  );
  const save = vi.fn();
  const generate = vi.fn();
  let service: LinksService;

  const databaseError = (code: string, constraint: string) =>
    new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('Database constraint failure'), {
        code,
        constraint,
      }),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    save.mockReset();
    generate.mockReset();
    generate.mockReturnValue('aB7xK2pq');
    service = new LinksService(
      { create, save } as unknown as Repository<Link>,
      { generate } as ShortCodeGenerator,
    );
  });

  it('persists the supplied owner and destination with a generated code', async () => {
    save.mockImplementation(async (link: Link) =>
      Object.assign(link, { id: 1 }),
    );
    const link = await service.create(7, 'https://example.com/article');
    expect(link).toMatchObject({
      id: 1,
      userId: 7,
      destination: 'https://example.com/article',
      code: 'aB7xK2pq',
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it('generates another code after a unique-code collision', async () => {
    generate.mockReturnValueOnce('existing').mockReturnValueOnce('new-code');
    save
      .mockRejectedValueOnce(
        databaseError('23505', 'UQ_52a3fa2a2c27a987ed58fd2ea42'),
      )
      .mockImplementationOnce(async (link: Link) =>
        Object.assign(link, { id: 2 }),
      );
    const link = await service.create(7, 'https://example.com');
    expect(link.code).toBe('new-code');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('stops after five code collisions', async () => {
    save.mockRejectedValue(
      databaseError('23505', 'UQ_52a3fa2a2c27a987ed58fd2ea42'),
    );
    await expect(
      service.create(7, 'https://example.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(save).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['23503', 'owner_foreign_key'],
    ['23505', 'some_other_unique_constraint'],
  ])('does not retry database failure %s on %s', async (code, constraint) => {
    const error = databaseError(code, constraint);
    save.mockRejectedValue(error);
    await expect(service.create(7, 'https://example.com')).rejects.toBe(error);
    expect(save).toHaveBeenCalledOnce();
  });

  it('propagates non-database errors', async () => {
    const error = new Error('Unexpected failure');
    save.mockRejectedValue(error);
    await expect(service.create(7, 'https://example.com')).rejects.toBe(error);
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('ShortCodeGenerator', () => {
  it('produces a twelve-character URL-safe code', () => {
    expect(new ShortCodeGenerator().generate()).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});
