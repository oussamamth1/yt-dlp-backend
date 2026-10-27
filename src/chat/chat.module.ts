import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallService } from './call.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, CallService],
})
export class ChatModule {}
