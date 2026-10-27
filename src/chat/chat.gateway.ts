import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { PresenceService } from '../presence/presence.service';
import { conversationId } from './conversation-id';
import { ChatService, type MessageType } from './chat.service';

interface AuthedSocket extends Socket {
  data: { username: string };
}

@WebSocketGateway({
  cors: { origin: '*' },
  // Default (1MB) is too small for base64-encoded voice/image messages.
  maxHttpBufferSize: 8 * 1024 * 1024,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly presence: PresenceService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new UnauthorizedException();
      const username = this.auth.verify(token);
      (client as AuthedSocket).data.username = username;
      this.presence.markOnline(username);
    } catch {
      client.emit('error', 'Unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (client.data?.username) {
      this.presence.markOffline(client.data.username);
    }
  }

  @SubscribeMessage('joinConversation')
  async joinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { otherUsername: string },
  ) {
    const room = conversationId(client.data.username, data.otherUsername);
    client.join(room);
    const history = await this.chat.getHistory(client.data.username, data.otherUsername);
    client.emit('history', history);
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { to: string; ciphertext: string; type?: MessageType },
  ) {
    const message = await this.chat.addMessage(
      client.data.username,
      data.to,
      data.ciphertext,
      data.type,
    );
    const room = conversationId(client.data.username, data.to);
    this.server.to(room).emit('message', message);
    return message;
  }
}
