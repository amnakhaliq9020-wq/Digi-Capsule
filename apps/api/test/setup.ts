import path from 'node:path';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5433/digi_capsule_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-digi-capsule';
process.env.NODE_ENV = 'test';
process.env.PRIVATE_MEDIA_ROOT =
  process.env.PRIVATE_MEDIA_ROOT ?? path.resolve(process.cwd(), '../../data/private-media-test');
process.env.PRIVATE_MEDIA_TMP =
  process.env.PRIVATE_MEDIA_TMP ?? path.resolve(process.cwd(), '../../data/private-media-tmp-test');
