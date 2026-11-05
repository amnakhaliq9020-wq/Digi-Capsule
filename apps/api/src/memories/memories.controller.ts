import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MemoryDto } from './dto';
import { MemoriesService } from './memories.service';

@Controller('memories')
@UseGuards(JwtAuthGuard)
export class MemoriesController {
  constructor(private readonly memories: MemoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memories.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: MemoryDto) {
    return this.memories.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memories.get(user.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MemoryDto) {
    return this.memories.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memories.remove(user.id, id);
  }
}
