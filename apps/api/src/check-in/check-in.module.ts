import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';

@Module({
  imports: [AuthModule],
  controllers: [CheckInController],
  providers: [CheckInService],
})
export class CheckInModule {}
