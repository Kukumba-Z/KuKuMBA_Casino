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

/**
 * Re-auth the socket on a token change WITHOUT tearing down the instance, so
 * every `.on(...)` handler already attached by pages (crash verdicts, the lobby
 * ticker, chat) survives. Destroying and rebuilding the socket here used to
 * strand those handlers on a dead instance — the gateway re-runs its connection
 * handler on the cycle below and re-joins the `user:<id>` room with the new token.
 */
export function reconnectSocket() {
  const token = useAuth.getState().accessToken;
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
    return socket;
  }
  return getSocket();
}
