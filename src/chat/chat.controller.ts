import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get(':otherUsername/messages')
  getHistory(@Param('otherUsername') otherUsername: string, @Req() req: Request) {
    const username = (req as Request & { username: string }).username;
    return this.chat.getHistory(username, otherUsername);
  }
}
