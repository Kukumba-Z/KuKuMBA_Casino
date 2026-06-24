import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private realtime: RealtimeService,
    private jwt: JwtService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
  }

  async handleConnection(client: Socket) {
    // Optional auth — a token lets us deliver private notifications.
    try {
      const token =
        (client.handshake.auth as any)?.token || (client.handshake.query as any)?.token;
      if (token) {
        const payload = await this.jwt.verifyAsync(token, {
          secret: process.env.JWT_ACCESS_SECRET,
        });
        client.data.userId = payload.sub;
        client.join(`user:${payload.sub}`);
      }
    } catch {
      // anonymous spectator — that's fine
    }
    this.realtime.addClient(client.id, client.data.userId);
    this.realtime.pushOnline();
  }

  handleDisconnect(client: Socket) {
    this.realtime.removeClient(client.id);
    this.realtime.pushOnline();
  }
}
