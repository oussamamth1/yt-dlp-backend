import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get(':otherUsername/messages')
  getHistory(@Param('otherUsername') otherUsername: string, @Req() req: Request) {
    const username = (req as Request & { username: string }).username;
    return this.chat.getHistory(username, otherUsername);
  }

  // Lets a CallKit "decline" action say no to a call without the app ever
  // launching its socket connection — used when the invite only reached the
  // device as a push because the app was fully closed.
  @Post('calls/:callId/decline')
  declineCall(@Param('callId') callId: string, @Req() req: Request) {
    const username = (req as Request & { username: string }).username;
    const declined = this.gateway.declineCallByUser(username, callId);
    return { ok: declined };
  }
}
