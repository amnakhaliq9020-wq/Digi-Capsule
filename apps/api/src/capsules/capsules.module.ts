import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CapsulesController } from './capsules.controller';
import { CapsulesService } from './capsules.service';

@Module({
  imports: [AuthModule],
  controllers: [CapsulesController],
  providers: [CapsulesService],
  exports: [CapsulesService],
})
export class CapsulesModule {}
