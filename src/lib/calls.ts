import { io, type Socket } from 'socket.io-client';

type CallHandlers = {
  onIncoming?: (payload: any) => void;
  onAccepted?: (payload: any) => void;
  onRejected?: (payload: any) => void;
  onOffer?: (payload: any) => void;
  onAnswer?: (payload: any) => void;
  onIce?: (payload: any) => void;
  onHangup?: (payload: any) => void;
};

let socket: Socket | null = null;
let handlersRef: CallHandlers = {};

function assertSecureSignalingUrl(signalingUrl: string) {
  const parsed = new URL(signalingUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocal = localHosts.has(parsed.hostname);
  const isSecure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';

  if (!__DEV__ && !isSecure) {
    throw new Error('In production, EXPO_PUBLIC_SIGNALING_URL must use https:// or wss://');
  }

  if (__DEV__ && !isSecure && !isLocal) {
    console.warn('Using insecure non-local signaling URL in development. Prefer https/wss for privacy.');
  }
}

export function connectCallSignaling(signalingUrl: string, token: string, handlers: CallHandlers = {}) {
  handlersRef = handlers;
  assertSecureSignalingUrl(signalingUrl);

  if (socket) {
    const currentUrl = (socket.io as unknown as { uri?: string }).uri || '';
    const normalizedTarget = signalingUrl.replace(/\/$/, '');
    const normalizedCurrent = currentUrl.replace(/\/$/, '');
    if (normalizedCurrent === normalizedTarget) return socket;
    socket.disconnect();
    socket = null;
  }

  socket = io(signalingUrl, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    timeout: 10000,
    reconnectionAttempts: 5,
  });

  socket.on('call:incoming', (payload) => handlersRef.onIncoming?.(payload));
  socket.on('call:accepted', (payload) => handlersRef.onAccepted?.(payload));
  socket.on('call:rejected', (payload) => handlersRef.onRejected?.(payload));
  socket.on('webrtc:offer', (payload) => handlersRef.onOffer?.(payload));
  socket.on('webrtc:answer', (payload) => handlersRef.onAnswer?.(payload));
  socket.on('webrtc:ice', (payload) => handlersRef.onIce?.(payload));
  socket.on('call:hangup', (payload) => handlersRef.onHangup?.(payload));

  return socket;
}

export function updateCallHandlers(handlers: CallHandlers = {}) {
  handlersRef = handlers;
}

export function getCallSocket() {
  return socket;
}

export function disconnectCallSignaling() {
  socket?.disconnect();
  socket = null;
  handlersRef = {};
}
