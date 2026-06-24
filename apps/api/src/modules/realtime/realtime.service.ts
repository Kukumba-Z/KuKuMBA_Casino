import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Central hub for everything pushed to connected clients: online counter,
 * the live-bet ticker, chat fan-out and per-user notifications.
 * The gateway binds the socket server here so any module can broadcast.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;
  private clients = new Map<string, string | undefined>(); // socketId -> userId

  bind(server: Server) {
    this.server = server;
  }

  addClient(socketId: string, userId?: string) {
    this.clients.set(socketId, userId);
  }

  removeClient(socketId: string) {
    this.clients.delete(socketId);
  }

  /** Connected sockets (a rough "players online" figure). */
  onlineCount(): number {
    return this.clients.size;
  }

  /** Distinct authenticated users online. */
  onlineUsers(): number {
    return new Set([...this.clients.values()].filter(Boolean)).size;
  }

  emit(event: string, payload: any) {
    this.server?.emit(event, payload);
  }

  toUser(userId: string, event: string, payload: any) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  // Convenience broadcasters ---------------------------------------------------
  liveBet(payload: any) {
    this.emit('bet', payload);
  }
  chatMessage(payload: any) {
    this.emit('chat', payload);
  }
  bigWin(payload: any) {
    this.emit('bigwin', payload);
  }
  raffleUpdate(payload: any) {
    this.emit('raffle', payload);
  }
  pushOnline() {
    this.emit('online', { sockets: this.onlineCount(), users: this.onlineUsers() });
  }
}
