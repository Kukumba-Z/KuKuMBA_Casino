import { io, Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';

let socket: Socket | null = null;

/** Lazily create the shared socket connection (proxied to the API in dev). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: useAuth.getState().accessToken },
    });
  }
  return socket;
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return getSocket();
}
