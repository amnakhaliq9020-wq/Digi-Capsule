import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckInService } from './check-in.service';

@Controller('check-in')
@UseGuards(JwtAuthGuard)
export class CheckInController {
  constructor(private readonly checkIn: CheckInService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.checkIn.status(user.id);
  }

  @Post()
  confirm(@CurrentUser() user: AuthUser) {
    return this.checkIn.confirm(user.id);
  }
}
