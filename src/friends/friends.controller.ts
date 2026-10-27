import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../auth/users.service';
import { PresenceService } from '../presence/presence.service';
import { SendFriendRequestDto } from './dto/send-request.dto';
import { FriendsService } from './friends.service';

type AuthedRequest = Request & { username: string };

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
  ) {}

  @Get('search')
  async search(@Query('q') q: string | undefined, @Req() req: AuthedRequest) {
    const usernames = await this.users.search(q ?? '', req.username);
    return this.withProfiles(usernames);
  }

  @Post('requests')
  sendRequest(@Body() dto: SendFriendRequestDto, @Req() req: AuthedRequest) {
    return this.friends.sendRequest(req.username, dto.username);
  }

  @Get('requests/incoming')
  incoming(@Req() req: AuthedRequest) {
    return this.friends.incoming(req.username);
  }

  @Post('requests/:id/accept')
  accept(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.friends.accept(req.username, id);
  }

  @Post('requests/:id/decline')
  decline(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.friends.decline(req.username, id);
  }

  @Get()
  async listFriends(@Req() req: AuthedRequest) {
    const usernames = await this.friends.listFriends(req.username);
    return this.withProfiles(usernames);
  }

  private async withProfiles(usernames: string[]) {
    return Promise.all(
      usernames.map(async (username) => ({
        username,
        status: await this.users.getStatus(username),
        online: this.presence.isOnline(username),
      })),
    );
  }
}
