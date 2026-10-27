import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PresenceService } from '../presence/presence.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from './users.service';

type AuthedRequest = Request & { username: string };

@UseGuards(JwtAuthGuard)
@Controller()
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly presence: PresenceService,
  ) {}

  @Get('me')
  async me(@Req() req: AuthedRequest) {
    return {
      username: req.username,
      status: await this.users.getStatus(req.username),
    };
  }

  @Patch('me')
  async updateMe(@Body() dto: UpdateStatusDto, @Req() req: AuthedRequest) {
    await this.users.updateStatus(req.username, dto.status);
    return { username: req.username, status: dto.status };
  }

  @Get('users/:username')
  async getUser(@Param('username') username: string) {
    return {
      username,
      status: await this.users.getStatus(username),
      online: this.presence.isOnline(username),
    };
  }
}
