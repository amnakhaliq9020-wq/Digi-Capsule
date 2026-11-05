import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [MemoriesController],
  providers: [MemoriesService],
})
export class MemoriesModule {}
