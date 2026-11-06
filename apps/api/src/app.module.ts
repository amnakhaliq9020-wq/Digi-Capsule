import { config } from 'dotenv';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CapsulesModule } from './capsules/capsules.module';
import { CheckInModule } from './check-in/check-in.module';
import { ContactsModule } from './contacts/contacts.module';
import { HealthController } from './health.controller';
import { MediaModule } from './media/media.module';
import { MemoriesModule } from './memories/memories.module';
import { PrismaModule } from './prisma/prisma.module';

config();

@Module({
  imports: [PrismaModule, AuthModule, ContactsModule, CheckInModule, CapsulesModule, MediaModule, MemoriesModule],
  controllers: [HealthController],
})
export class AppModule {}
