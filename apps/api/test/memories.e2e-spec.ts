import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const prisma = new PrismaClient();

type ApiAgent = {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
  'base64',
);

function mp4() {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32BE(24, 0);
  buffer.write('ftypisom', 4);
  return buffer;
}

function wav() {
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.write('WAVE', 8);
  return buffer;
}

describe('Memories (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    if (process.env.PRIVATE_MEDIA_ROOT) {
      await rm(process.env.PRIVATE_MEDIA_ROOT, { recursive: true, force: true });
    }
    delete process.env.MEDIA_PHOTO_MAX_BYTES;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function register(email: string) {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/auth/register').send({ name: 'Test User', email, password: 'password123' });
    expect(response.status).toBe(201);
    return agent;
  }

  async function capsule(agent: ApiAgent, title = 'Family Capsule') {
    const response = await agent.post('/capsules').send({ title, description: 'Private collection' });
    expect(response.status).toBe(201);
    return response.body as { id: string; title: string };
  }

  async function upload(agent: ApiAgent, file: Buffer, filename: string, contentType: string, kind: string) {
    const response = await agent.post('/media').field('kind', kind).attach('file', file, { filename, contentType });
    expect(response.status).toBe(201);
    expect(response.body.storageKey).toBeUndefined();
    return response.body as { id: string; originalName: string; mimeType: string };
  }

  it('opens the memory list for the signed-in user and hides it otherwise', async () => {
    const agent = await register('home@example.com');
    const list = await agent.get('/memories');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const anonymous = await request(app.getHttpServer()).get('/memories');
    expect(anonymous.status).toBe(401);
  });

  it('creates a capsule for the signed-in user only', async () => {
    const owner = await register('capsule-owner@example.com');
    const created = await capsule(owner, 'Letters home');
    const other = await register('capsule-other@example.com');
    expect((await other.get('/capsules')).body).toEqual([]);
    expect((await other.get(`/capsules/${created.id}`)).status).toBe(404);
  });

  it('saves a personal letter as a private draft', async () => {
    const agent = await register('letter@example.com');
    const savedCapsule = await capsule(agent);
    const response = await agent.post('/memories').send({
      title: 'A letter for later',
      description: 'Keep this private',
      type: 'LETTER',
      body: 'Hello, this is only for my capsule. <script>alert(1)</script>',
      tags: ['family', 'letter'],
      capsuleId: savedCapsule.id,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'A letter for later',
      type: 'LETTER',
      status: 'DRAFT',
      body: 'Hello, this is only for my capsule. <script>alert(1)</script>',
    });
    expect(response.body.sentAt).toBeUndefined();
    expect(response.body.recipients).toBeUndefined();

    const listed = await agent.get('/memories');
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].preview).toContain('Keep this private');
    expect(listed.body[0].status).toBe('DRAFT');
  });

  it('requires a capsule before a memory can be saved', async () => {
    const agent = await register('no-capsule@example.com');
    const response = await agent.post('/memories').send({
      title: 'Too soon',
      type: 'LETTER',
      body: 'Hello',
      capsuleId: 'missing-capsule',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/create a capsule/i);
    expect(await prisma.memoryItem.count()).toBe(0);
  });

  it.each([
    ['PHOTO', png, 'tiny.png', 'image/png'],
    ['VIDEO', mp4(), 'clip.mp4', 'video/mp4'],
    ['AUDIO', wav(), 'voice.wav', 'audio/wav'],
    ['DOCUMENT', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'), 'note.pdf', 'application/pdf'],
  ] as const)('saves a %s draft without releasing it', async (kind, file, filename, contentType) => {
    const agent = await register(`${kind.toLowerCase()}@example.com`);
    const savedCapsule = await capsule(agent);
    const asset = await upload(agent, Buffer.from(file), filename, contentType, kind);
    const response = await agent.post('/memories').send({
      title: `${kind} memory`,
      description: 'Stored privately',
      type: kind,
      capsuleId: savedCapsule.id,
      assetIds: [asset.id],
      tags: [kind.toLowerCase()],
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.assets).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('storageKey');
    expect(JSON.stringify(response.body)).not.toContain('private-media');

    const content = await agent.get(`/media/${asset.id}/content`);
    expect(content.status).toBe(200);
    expect(content.header['cache-control']).toContain('private');
  });

  it('saves a text document and rejects a fake photo', async () => {
    const agent = await register('files@example.com');
    const savedCapsule = await capsule(agent);
    const text = await upload(agent, Buffer.from('A private note.'), 'note.txt', 'text/plain', 'DOCUMENT');
    const saved = await agent.post('/memories').send({
      title: 'Notes',
      type: 'DOCUMENT',
      capsuleId: savedCapsule.id,
      assetIds: [text.id],
    });
    expect(saved.status).toBe(201);

    const fake = await agent
      .post('/media')
      .field('kind', 'PHOTO')
      .attach('file', Buffer.from('hello'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(fake.status).toBe(400);
    expect(fake.body.message).toMatch(/jpg or png/i);
  });

  it('rejects an oversized photo using the configured limit', async () => {
    process.env.MEDIA_PHOTO_MAX_BYTES = '20';
    const agent = await register('large@example.com');
    const response = await agent
      .post('/media')
      .field('kind', 'PHOTO')
      .attach('file', png, { filename: 'big.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/larger than the allowed size/i);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it('edits a memory without creating a duplicate', async () => {
    const agent = await register('edit-memory@example.com');
    const savedCapsule = await capsule(agent);
    const created = await agent.post('/memories').send({
      title: 'Original title',
      type: 'LETTER',
      body: 'First draft',
      capsuleId: savedCapsule.id,
      tags: ['one'],
    });
    const before = await prisma.memoryItem.count();
    const updated = await agent.patch(`/memories/${created.body.id}`).send({
      title: 'Updated title',
      description: 'Revised',
      type: 'LETTER',
      body: 'Second draft',
      capsuleId: savedCapsule.id,
      tags: ['two'],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.title).toBe('Updated title');
    expect(updated.body.body).toBe('Second draft');
    expect(await prisma.memoryItem.count()).toBe(before);
  });

  it('deletes a memory and its private file', async () => {
    const agent = await register('delete-memory@example.com');
    const savedCapsule = await capsule(agent);
    const asset = await upload(agent, jpeg, 'face.jpg', 'image/jpeg', 'PHOTO');
    const created = await agent.post('/memories').send({
      title: 'A photo',
      type: 'PHOTO',
      capsuleId: savedCapsule.id,
      assetIds: [asset.id],
    });
    const removed = await agent.delete(`/memories/${created.body.id}`);
    expect(removed.status).toBe(200);
    expect(await prisma.memoryItem.count()).toBe(0);
    expect(await prisma.mediaAsset.count()).toBe(0);
    expect((await agent.get(`/media/${asset.id}/content`)).status).toBe(404);
  });

  it('stops one user from reading or changing another user’s memories and files', async () => {
    const owner = await register('private-owner@example.com');
    const savedCapsule = await capsule(owner);
    const asset = await upload(owner, png, 'secret.png', 'image/png', 'PHOTO');
    const created = await owner.post('/memories').send({
      title: 'Secret memory',
      type: 'PHOTO',
      capsuleId: savedCapsule.id,
      assetIds: [asset.id],
    });
    const link = await owner.post(`/media/${asset.id}/link`);
    expect(link.status).toBe(201);
    expect(link.body.url).toContain('token=');

    const other = await register('private-other@example.com');
    expect((await other.get('/memories')).body).toEqual([]);
    expect((await other.get(`/memories/${created.body.id}`)).status).toBe(404);
    expect((await other.patch(`/memories/${created.body.id}`).send({
      title: 'Stolen',
      type: 'PHOTO',
      capsuleId: savedCapsule.id,
      assetIds: [asset.id],
    })).status).toBe(404);
    expect((await other.delete(`/memories/${created.body.id}`)).status).toBe(404);
    expect((await other.get(`/media/${asset.id}/content`)).status).toBe(404);
    expect((await other.post(`/media/${asset.id}/link`)).status).toBe(404);

    const stored = await prisma.memoryItem.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.title).toBe('Secret memory');
    expect(stored.status).toBe('DRAFT');
  });

  it('does not schedule, release, or send a memory', async () => {
    const agent = await register('safety@example.com');
    const savedCapsule = await capsule(agent);
    const created = await agent.post('/memories').send({
      title: 'Still private',
      type: 'LETTER',
      body: 'Do not send this.',
      capsuleId: savedCapsule.id,
    });

    expect((await agent.post(`/memories/${created.body.id}/release`)).status).toBe(404);
    const rejected = await agent.patch(`/memories/${created.body.id}`).send({
      title: 'Still private',
      type: 'LETTER',
      body: 'Do not send this.',
      capsuleId: savedCapsule.id,
      status: 'RELEASED',
    });
    expect(rejected.status).toBe(400);
    const stored = await prisma.memoryItem.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.status).toBe('DRAFT');
    expect(await prisma.contact.count()).toBe(0);
  });
});
