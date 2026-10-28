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
import { UsersService } from '../auth/users.service';
import { PresenceService } from '../presence/presence.service';
import { PushService } from '../push/push.service';
import { conversationId } from './conversation-id';
import { ChatService, type MessageType } from './chat.service';
import { CallService } from './call.service';

interface AuthedSocket extends Socket {
  data: { username: string };
}

function userRoom(username: string): string {
  return `user:${username.toLowerCase()}`;
}

// The server only ever holds ciphertext, so a message push can't preview the
// content — just say what kind of message it was.
const MESSAGE_PUSH_BODY: Record<MessageType, string> = {
  text: 'Sent you a message',
  image: 'Sent you a photo',
  voice: 'Sent you a voice message',
};

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
    private readonly calls: CallService,
    private readonly users: UsersService,
    private readonly push: PushService,
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
      // A personal room so call signaling can reach every socket this user
      // has open, regardless of which conversation (if any) they're in.
      client.join(userRoom(username));
    } catch {
      client.emit('error', 'Unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (client.data?.username) {
      this.presence.markOffline(client.data.username);
      for (const call of this.calls.callsInvolving(client.data.username)) {
        const other = this.calls.otherParty(call, client.data.username);
        this.calls.end(call.id);
        this.server.to(userRoom(other)).emit('call:ended', { callId: call.id });
      }
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
    // Sent regardless of whether the recipient's socket looks connected —
    // a socket can outlive the app actually being in the foreground (the
    // same gap that made calls ring silently), so the push, not presence,
    // is what decides whether this needed to reach the lock screen. Android
    // only surfaces it itself when the app isn't in the foreground anyway.
    const fcmToken = await this.users.getFcmToken(data.to);
    if (fcmToken) {
      const body = MESSAGE_PUSH_BODY[data.type ?? 'text'] ?? MESSAGE_PUSH_BODY.text;
      await this.push.sendMessageNotification(fcmToken, client.data.username, body);
    }
    return message;
  }

  @SubscribeMessage('call:invite')
  async callInvite(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { to: string }) {
    const me = client.data.username;
    if (this.calls.isBusy(me)) {
      client.emit('call:busy', { callId: null });
      return;
    }
    if (this.calls.isBusy(data.to)) {
      client.emit('call:unavailable', { to: data.to });
      return;
    }
    const online = this.presence.isOnline(data.to);
    const fcmToken = online ? undefined : await this.users.getFcmToken(data.to);
    if (!online && !fcmToken) {
      client.emit('call:unavailable', { to: data.to });
      return;
    }
    const call = this.calls.create(me, data.to);
    if (online) {
      this.server.to(userRoom(data.to)).emit('call:incoming', { callId: call.id, from: me });
    } else if (fcmToken) {
      // The callee's app isn't connected (backgrounded or fully closed) — a
      // push is the only way to reach it. The data-only payload is turned
      // into a native incoming-call screen by the app's background handler,
      // which can wake and answer the call before the socket reconnects.
      await this.push.sendCallPush(fcmToken, { type: 'invite', callId: call.id, from: me });
    }
    client.emit('call:ringing', { callId: call.id, to: data.to });
  }

  @SubscribeMessage('call:accept')
  callAccept(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string }) {
    const call = this.calls.get(data.callId);
    if (!call || !this.calls.isParty(call, client.data.username)) return;
    this.calls.markActive(call.id);
    this.server.to(userRoom(call.caller)).emit('call:accepted', { callId: call.id });
  }

  @SubscribeMessage('call:decline')
  callDecline(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string }) {
    this.declineCallByUser(client.data.username, data.callId);
  }

  /**
   * Shared by the socket handler above and CallsController's REST endpoint —
   * the latter lets a CallKit "decline" action on a cold-launched (app not
   * running) device say no without first having to stand up a socket.
   */
  declineCallByUser(username: string, callId: string): boolean {
    const call = this.calls.get(callId);
    if (!call || !this.calls.isParty(call, username)) return false;
    this.calls.end(call.id);
    this.server.to(userRoom(call.caller)).emit('call:declined', { callId: call.id });
    return true;
  }

  @SubscribeMessage('call:cancel')
  async callCancel(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string }) {
    const call = this.calls.get(data.callId);
    if (!call || !this.calls.isParty(call, client.data.username)) return;
    this.calls.end(call.id);
    if (this.presence.isOnline(call.callee)) {
      this.server.to(userRoom(call.callee)).emit('call:cancelled', { callId: call.id });
    } else {
      // The invite reached the callee as a push, not a live socket — tell
      // its background handler to clear the CallKit screen the same way.
      const fcmToken = await this.users.getFcmToken(call.callee);
      if (fcmToken) {
        await this.push.sendCallPush(fcmToken, { type: 'cancelled', callId: call.id });
      }
    }
  }

  @SubscribeMessage('call:hangup')
  callHangup(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string }) {
    const call = this.calls.get(data.callId);
    if (!call || !this.calls.isParty(call, client.data.username)) return;
    const other = this.calls.otherParty(call, client.data.username);
    this.calls.end(call.id);
    this.server.to(userRoom(other)).emit('call:ended', { callId: call.id });
  }

  // The actual audio never passes through here — these three just relay the
  // WebRTC handshake (SDP offer/answer, ICE candidates) between the two
  // clients so they can set up a direct, independently-encrypted media path.
  @SubscribeMessage('call:offer')
  callOffer(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string; sdp: string }) {
    this.relaySignal(client, data.callId, 'call:offer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('call:answer')
  callAnswer(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { callId: string; sdp: string }) {
    this.relaySignal(client, data.callId, 'call:answer', { callId: data.callId, sdp: data.sdp });
  }

  @SubscribeMessage('call:ice-candidate')
  callIceCandidate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { callId: string; candidate: unknown },
  ) {
    this.relaySignal(client, data.callId, 'call:ice-candidate', {
      callId: data.callId,
      candidate: data.candidate,
    });
  }

  private relaySignal(client: AuthedSocket, callId: string, event: string, payload: unknown) {
    const call = this.calls.get(callId);
    if (!call || !this.calls.isParty(call, client.data.username)) return;
    const other = this.calls.otherParty(call, client.data.username);
    this.server.to(userRoom(other)).emit(event, payload);
  }
}
