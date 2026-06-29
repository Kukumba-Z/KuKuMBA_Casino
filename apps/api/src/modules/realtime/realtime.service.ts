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

  // Rolling in-memory buffer of the most recent live bets. Only the last N are
  // kept in server memory; older ones are dropped (the DB GameRound rows stay —
  // they're the audit/history record, this is just the live ticker's cache).
  private static readonly LIVE_CAP = 15;
  private recent: any[] = [];

  bind(server: Server) {
    this.server = server;
  }

  /** The last ≤15 live bets, newest first — what the lobby seeds its ticker from. */
  recentBets(): any[] {
    return this.recent;
  }

  /** Seed the buffer (e.g. from the DB on startup) so it isn't empty after a restart. */
  seedBets(items: any[]) {
    this.recent = items.slice(0, RealtimeService.LIVE_CAP);
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
    // Keep only the last N in memory; drop the rest.
    this.recent.unshift(payload);
    if (this.recent.length > RealtimeService.LIVE_CAP) this.recent.length = RealtimeService.LIVE_CAP;
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
