import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapsulesService } from './capsules.service';
import { CapsuleDto } from './dto';

@Controller('capsules')
@UseGuards(JwtAuthGuard)
export class CapsulesController {
  constructor(private readonly capsules: CapsulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.capsules.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CapsuleDto) {
    return this.capsules.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.capsules.get(user.id, id);
  }
}
