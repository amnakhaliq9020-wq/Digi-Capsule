import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

type StoredFile = { originalname: string; mimetype: string; size: number; path: string };
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { maxUploadBytes, UploadKind } from './media-limits';
import { MediaService, removeTemp } from './media.service';

const UPLOAD_KINDS: UploadKind[] = ['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'];

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: unknown, _file: unknown, callback: (error: Error | null, destination: string) => void) => {
          const directory = process.env.PRIVATE_MEDIA_TMP || defaultTmp();
          mkdirSync(directory, { recursive: true });
          callback(null, directory);
        },
        filename: (_req: unknown, _file: unknown, callback: (error: Error | null, filename: string) => void) => callback(null, randomUUID()),
      }),
      limits: { files: 1, fileSize: maxUploadBytes() },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: StoredFile | undefined,
    @Body('kind') kind: string,
  ) {
    try {
      if (!file) throw new BadRequestException('Choose a file to upload.');
      if (!UPLOAD_KINDS.includes(kind as UploadKind)) {
        throw new BadRequestException('Choose a photo, video, audio file, or document.');
      }
      return await this.media.save(user.id, file, kind as UploadKind);
    } finally {
      await removeTemp(file);
    }
  }

  @Post(':id/link')
  @UseGuards(JwtAuthGuard)
  link(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.createLink(user.id, id);
  }

  @Get(':id/content')
  @UseGuards(JwtAuthGuard)
  async content(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return this.media.content(user.id, id);
  }

  @Get('access')
  async access(@Query('token') token: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return this.media.contentFromToken(token || '');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.remove(user.id, id);
  }
}

function defaultTmp() {
  const nested = path.basename(process.cwd()) === 'api';
  return path.resolve(process.cwd(), nested ? '../../data/private-media-tmp' : 'data/private-media-tmp');
}
