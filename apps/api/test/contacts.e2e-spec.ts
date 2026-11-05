import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ContactRole, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const prisma = new PrismaClient();

describe('Contacts (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.contact.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function register(email: string, name = 'Amina Shah') {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/auth/register').send({
      name,
      email,
      password: 'password123',
    });
    expect(response.status).toBe(201);
    return { agent, user: response.body.user as { id: string; email: string; name: string } };
  }

  it('lets a user add the first contact', async () => {
    const { agent } = await register('first@example.com');

    const response = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      phone: '+92 300 1234567',
      slot: 1,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      phone: '+923001234567',
      role: 'RECIPIENT',
      slot: 1,
    });

    const stored = await prisma.contact.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].email).toBe('sara@example.com');
  });

  it('lets a user add the second contact', async () => {
    const { agent } = await register('second@example.com');
    await agent.post('/contacts').send({ fullName: 'Sara Khan', email: 'sara@example.com', slot: 1 });

    const response = await agent.post('/contacts').send({
      fullName: 'Hassan Ali',
      email: 'hassan@example.com',
      slot: 2,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      fullName: 'Hassan Ali',
      email: 'hassan@example.com',
      phone: null,
      slot: 2,
    });

    const list = await agent.get('/contacts');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.map((contact: { slot: number }) => contact.slot)).toEqual([1, 2]);
  });

  it('does not allow a third contact', async () => {
    const { agent } = await register('third@example.com');
    await agent.post('/contacts').send({ fullName: 'Sara Khan', email: 'sara@example.com', slot: 1 });
    await agent.post('/contacts').send({ fullName: 'Hassan Ali', email: 'hassan@example.com', slot: 2 });

    const response = await agent.post('/contacts').send({
      fullName: 'Extra Person',
      email: 'extra@example.com',
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/both contact slots are occupied/i);
    expect(await prisma.contact.count()).toBe(2);
  });

  it('lets a user edit the first contact', async () => {
    const { agent } = await register('edit-one@example.com');
    const created = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      phone: '+923001234567',
      slot: 1,
    });

    const response = await agent.patch(`/contacts/${created.body.id}`).send({
      fullName: 'Sara Qureshi',
      email: 'sara.qureshi@example.com',
      phone: '+14155552671',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: created.body.id,
      fullName: 'Sara Qureshi',
      email: 'sara.qureshi@example.com',
      phone: '+14155552671',
      slot: 1,
    });
  });

  it('lets a user edit the second contact', async () => {
    const { agent } = await register('edit-two@example.com');
    await agent.post('/contacts').send({ fullName: 'Sara Khan', email: 'sara@example.com', slot: 1 });
    const second = await agent.post('/contacts').send({
      fullName: 'Hassan Ali',
      email: 'hassan@example.com',
      slot: 2,
    });

    const response = await agent.patch(`/contacts/${second.body.id}`).send({
      fullName: 'Hassan Raza',
      email: 'hassan.raza@example.com',
      phone: '+447911123456',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fullName: 'Hassan Raza',
      email: 'hassan.raza@example.com',
      phone: '+447911123456',
      slot: 2,
    });
  });

  it('persists updated contact information in the database', async () => {
    const { agent, user } = await register('persist@example.com');
    const created = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      slot: 1,
    });

    await agent.patch(`/contacts/${created.body.id}`).send({
      fullName: 'Sara Updated',
      email: 'sara.updated@example.com',
      phone: '+923009998877',
    });

    const stored = await prisma.contact.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.ownerId).toBe(user.id);
    expect(stored.fullName).toBe('Sara Updated');
    expect(stored.email).toBe('sara.updated@example.com');
    expect(stored.phone).toBe('+923009998877');

    const listed = await agent.get('/contacts');
    expect(listed.body[0]).toMatchObject({
      fullName: 'Sara Updated',
      email: 'sara.updated@example.com',
      phone: '+923009998877',
    });
  });

  it('rejects an invalid email', async () => {
    const { agent } = await register('invalid-email@example.com');

    const response = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'not-an-email',
      slot: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.email).toMatch(/valid email/i);
    expect(await prisma.contact.count()).toBe(0);
  });

  it('rejects a duplicate contact email for the same user', async () => {
    const { agent } = await register('duplicate@example.com');
    await agent.post('/contacts').send({ fullName: 'Sara Khan', email: 'sara@example.com', slot: 1 });

    const response = await agent.post('/contacts').send({
      fullName: 'Sara Again',
      email: 'Sara@Example.com',
      slot: 2,
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already saved/i);
    expect(await prisma.contact.count()).toBe(1);
  });

  it('rejects contact management when the user is not authenticated', async () => {
    const { agent } = await register('owner@example.com');
    const created = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      slot: 1,
    });

    const anonymous = request(app.getHttpServer());
    const list = await anonymous.get('/contacts');
    const create = await anonymous.post('/contacts').send({
      fullName: 'Hassan Ali',
      email: 'hassan@example.com',
    });
    const update = await anonymous.patch(`/contacts/${created.body.id}`).send({
      fullName: 'Changed',
      email: 'changed@example.com',
    });

    expect(list.status).toBe(401);
    expect(create.status).toBe(401);
    expect(update.status).toBe(401);
    expect(list.body.message).toMatch(/authentication required/i);
  });

  it('stops one user from viewing or editing another user’s contacts', async () => {
    const owner = await register('user-a@example.com', 'User A');
    const created = await owner.agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      phone: '+923001234567',
      slot: 1,
    });

    const other = await register('user-b@example.com', 'User B');
    const list = await other.agent.get('/contacts');
    const read = await other.agent.get(`/contacts/${created.body.id}`);
    const update = await other.agent.patch(`/contacts/${created.body.id}`).send({
      fullName: 'Stolen Name',
      email: 'stolen@example.com',
    });
    const remove = await other.agent.delete(`/contacts/${created.body.id}`);

    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    expect(JSON.stringify(list.body)).not.toContain('sara@example.com');
    expect(read.status).toBe(404);
    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);

    const stored = await prisma.contact.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.fullName).toBe('Sara Khan');
    expect(stored.email).toBe('sara@example.com');
    expect(stored.ownerId).toBe(owner.user.id);
  });

  it('keeps recipient slots separate from verifiers and trusted contacts', async () => {
    const { agent, user } = await register('roles@example.com');
    await prisma.contact.create({
      data: {
        ownerId: user.id,
        fullName: 'Verifier Person',
        email: 'verifier@example.com',
        role: ContactRole.VERIFIER,
        slot: 1,
      },
    });

    const rejected = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      role: 'VERIFIER',
      slot: 1,
    });
    expect(rejected.status).toBe(400);

    const created = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      slot: 1,
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('RECIPIENT');

    const list = await agent.get('/contacts');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe('sara@example.com');
  });

  it('frees a slot when the owner removes a contact', async () => {
    const { agent } = await register('remove@example.com');
    const created = await agent.post('/contacts').send({
      fullName: 'Sara Khan',
      email: 'sara@example.com',
      slot: 1,
    });
    await agent.post('/contacts').send({ fullName: 'Hassan Ali', email: 'hassan@example.com', slot: 2 });

    const removed = await agent.delete(`/contacts/${created.body.id}`);
    expect(removed.status).toBe(200);

    const createdAgain = await agent.post('/contacts').send({
      fullName: 'Amina Shah',
      email: 'amina@example.com',
      slot: 1,
    });
    expect(createdAgain.status).toBe(201);
    expect(createdAgain.body).toMatchObject({ fullName: 'Amina Shah', slot: 1 });
    expect(await prisma.contact.count()).toBe(2);
  });

  it('rejects a blank name', async () => {
    const { agent } = await register('blank-name@example.com');
    const response = await agent.post('/contacts').send({
      fullName: '   ',
      email: 'sara@example.com',
      slot: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.fullName).toBeTruthy();
    expect(await prisma.contact.count()).toBe(0);
  });
});
