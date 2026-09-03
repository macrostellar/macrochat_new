import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const server = createServer(app);

const rawOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
const allowed = rawOrigins.length > 0 ? rawOrigins : ['http://localhost:8081'];
const jwtSecret = process.env.JWT_SECRET && process.env.JWT_SECRET !== 'replace_me' ? process.env.JWT_SECRET : null;
const jwtAudience = process.env.JWT_AUDIENCE || 'authenticated';
const jwtIssuer = process.env.JWT_ISSUER;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requireConversationMembership = (process.env.REQUIRE_CONVERSATION_MEMBERSHIP || 'true').toLowerCase() !== 'false';

const eventLimits = {
  windowMs: Number(process.env.EVENT_LIMIT_WINDOW_MS || 4000),
  maxEvents: Number(process.env.EVENT_LIMIT_MAX || 80),
};

// Modern Supabase projects sign access tokens with an asymmetric key (ES256/RS256) verified via JWKS.
// Older projects may still use a shared HS256 secret - keep that as a fallback.
const remoteJwks = supabaseUrl ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)) : null;
const legacySecretKey = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;

if (!remoteJwks && !legacySecretKey) {
  throw new Error('Configure SUPABASE_URL (for JWKS verification) or JWT_SECRET (legacy HS256) to verify call auth tokens');
}

if (requireConversationMembership && (!supabaseUrl || !supabaseServiceRoleKey)) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured when REQUIRE_CONVERSATION_MEMBERSHIP=true');
}

function isOriginAllowed(origin) {
  if (!origin) return true;

  return allowed.some((pattern) => {
    if (pattern === '*') return true;

    if (!pattern.includes('*')) {
      return origin === pattern;
    }

    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(origin);
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'macrochat-signaling', ts: Date.now() });
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
    credentials: true,
  },
});

const onlineUsers = new Map();
const activeCalls = new Map();

function addOnlineSocket(userId, socketId) {
  const sockets = onlineUsers.get(userId) || new Set();
  sockets.add(socketId);
  onlineUsers.set(userId, sockets);
}

function removeOnlineSocket(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
  }
}

function emitToUser(userId, event, payload) {
  const sockets = onlineUsers.get(userId);
  if (!sockets || sockets.size === 0) return false;

  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
  return true;
}

function isSafeId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function shouldRateLimit(socket, eventName) {
  const now = Date.now();
  const usage = socket.data.rateUsage || {};
  const current = usage[eventName];

  if (!current || now - current.windowStart > eventLimits.windowMs) {
    usage[eventName] = { count: 1, windowStart: now };
    socket.data.rateUsage = usage;
    return false;
  }

  current.count += 1;
  socket.data.rateUsage = usage;
  return current.count > eventLimits.maxEvents;
}

function guarded(socket, eventName, fn) {
  return async (payload = {}) => {
    if (shouldRateLimit(socket, eventName)) {
      socket.emit('call:error', { code: 'rate_limited', message: 'Too many signaling events. Please slow down.' });
      return;
    }

    try {
      await fn(payload || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected signaling error';
      socket.emit('call:error', { code: 'bad_request', message });
    }
  };
}

async function ensureUsersInConversation(conversationId, callerUserId, calleeUserId) {
  if (!requireConversationMembership) return true;
  if (!supabaseUrl || !supabaseServiceRoleKey) return false;

  const a = encodeURIComponent(callerUserId);
  const b = encodeURIComponent(calleeUserId);
  const c = encodeURIComponent(conversationId);

  const url = `${supabaseUrl}/rest/v1/macrochat_conversation_members?select=user_id&conversation_id=eq.${c}&user_id=in.(${a},${b})`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Membership check failed with HTTP ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) return false;

  const present = new Set(rows.map((row) => row?.user_id).filter((value) => typeof value === 'string'));
  return present.has(callerUserId) && present.has(calleeUserId);
}

async function ensureUsersNotBlocked(firstUserId, secondUserId) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return false;
  const first = encodeURIComponent(firstUserId);
  const second = encodeURIComponent(secondUserId);
  const filter = `or=(and(blocker_id.eq.${first},blocked_id.eq.${second}),and(blocker_id.eq.${second},blocked_id.eq.${first}))`;
  const response = await fetch(`${supabaseUrl}/rest/v1/macrochat_blocked_users?select=blocker_id&${filter}`, {
    method: 'GET',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Block check failed with HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 0;
}

function requireActiveCall(callId, actorUserId) {
  const call = activeCalls.get(callId);
  if (!call) throw new Error('Call not found or expired');
  if (call.callerUserId !== actorUserId && call.calleeUserId !== actorUserId) {
    throw new Error('You are not a participant in this call');
  }
  return call;
}

async function requireAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));

    let payload;
    if (remoteJwks) {
      try {
        ({ payload } = await jwtVerify(token, remoteJwks, { audience: jwtAudience, issuer: jwtIssuer }));
      } catch (jwksError) {
        if (!legacySecretKey) throw jwksError;
        ({ payload } = await jwtVerify(token, legacySecretKey, { audience: jwtAudience, issuer: jwtIssuer, algorithms: ['HS256'] }));
      }
    } else {
      ({ payload } = await jwtVerify(token, legacySecretKey, { audience: jwtAudience, issuer: jwtIssuer, algorithms: ['HS256'] }));
    }

    const userId = payload.sub || payload.userId;
    if (!userId || typeof userId !== 'string') return next(new Error('Invalid auth subject'));

    socket.data.userId = userId;
    return next();
  } catch (error) {
    return next(new Error(error instanceof Error ? error.message : 'Authentication failed'));
  }
}

io.use(requireAuth);

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  addOnlineSocket(userId, socket.id);

  socket.on('call:invite', guarded(socket, 'call:invite', async (payload) => {
    const { callId, toUserId, conversationId, video } = payload;
    if (!isSafeId(callId) || !isSafeId(toUserId) || !isSafeId(conversationId)) {
      throw new Error('Invalid call invite payload');
    }
    if (toUserId === userId) {
      throw new Error('Cannot call yourself');
    }

    const [authorized, notBlocked] = await Promise.all([
      ensureUsersInConversation(conversationId, userId, toUserId),
      ensureUsersNotBlocked(userId, toUserId),
    ]);
    if (!authorized || !notBlocked) {
      throw new Error('Call is not authorized for this conversation');
    }

    const delivered = emitToUser(toUserId, 'call:incoming', {
      callId,
      fromUserId: userId,
      conversationId,
      video: Boolean(video),
      ts: Date.now(),
    });

    if (!delivered) {
      socket.emit('call:status', { callId, status: 'offline' });
      return;
    }

    activeCalls.set(callId, {
      callId,
      conversationId,
      callerUserId: userId,
      calleeUserId: toUserId,
      video: Boolean(video),
      createdAt: Date.now(),
    });
  }));

  socket.on('call:accept', guarded(socket, 'call:accept', async (payload) => {
    const { callId } = payload;
    if (!isSafeId(callId)) throw new Error('Invalid call id');
    const call = requireActiveCall(callId, userId);
    if (userId !== call.calleeUserId) throw new Error('Only callee can accept this call');

    emitToUser(call.callerUserId, 'call:accepted', {
      callId,
      byUserId: userId,
      conversationId: call.conversationId,
      ts: Date.now(),
    });
  }));

  socket.on('call:reject', guarded(socket, 'call:reject', async (payload) => {
    const { callId, reason } = payload;
    if (!isSafeId(callId)) throw new Error('Invalid call id');
    const call = requireActiveCall(callId, userId);
    if (userId !== call.calleeUserId) throw new Error('Only callee can reject this call');

    emitToUser(call.callerUserId, 'call:rejected', {
      callId,
      byUserId: userId,
      reason: typeof reason === 'string' && reason.length <= 64 ? reason : 'rejected',
      conversationId: call.conversationId,
      ts: Date.now(),
    });

    activeCalls.delete(callId);
  }));

  socket.on('webrtc:offer', guarded(socket, 'webrtc:offer', async (payload) => {
    const { callId, sdp } = payload;
    if (!isSafeId(callId) || typeof sdp !== 'string' || sdp.length > 200000) {
      throw new Error('Invalid WebRTC offer payload');
    }
    const call = requireActiveCall(callId, userId);
    const targetUserId = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;

    emitToUser(targetUserId, 'webrtc:offer', {
      fromUserId: userId,
      callId,
      conversationId: call.conversationId,
      sdp,
    });
  }));

  socket.on('webrtc:answer', guarded(socket, 'webrtc:answer', async (payload) => {
    const { callId, sdp } = payload;
    if (!isSafeId(callId) || typeof sdp !== 'string' || sdp.length > 200000) {
      throw new Error('Invalid WebRTC answer payload');
    }
    const call = requireActiveCall(callId, userId);
    const targetUserId = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;

    emitToUser(targetUserId, 'webrtc:answer', {
      fromUserId: userId,
      callId,
      conversationId: call.conversationId,
      sdp,
    });
  }));

  socket.on('webrtc:ice', guarded(socket, 'webrtc:ice', async (payload) => {
    const { callId, candidate } = payload;
    if (!isSafeId(callId) || typeof candidate !== 'string' || candidate.length > 16384) {
      throw new Error('Invalid ICE payload');
    }
    const call = requireActiveCall(callId, userId);
    const targetUserId = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;

    emitToUser(targetUserId, 'webrtc:ice', {
      fromUserId: userId,
      callId,
      conversationId: call.conversationId,
      candidate,
    });
  }));

  socket.on('call:hangup', guarded(socket, 'call:hangup', async (payload) => {
    const { callId } = payload;
    if (!isSafeId(callId)) throw new Error('Invalid call id');
    const call = requireActiveCall(callId, userId);
    const targetUserId = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;

    emitToUser(targetUserId, 'call:hangup', {
      callId,
      byUserId: userId,
      conversationId: call.conversationId,
      ts: Date.now(),
    });

    activeCalls.delete(callId);
  }));

  socket.on('disconnect', () => {
    removeOnlineSocket(userId, socket.id);
  });
});

setInterval(() => {
  const maxAgeMs = 1000 * 60 * 60 * 6;
  const cutoff = Date.now() - maxAgeMs;

  for (const [callId, call] of activeCalls.entries()) {
    if (call.createdAt < cutoff) {
      activeCalls.delete(callId);
    }
  }
}, 1000 * 60 * 10);

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`macrochat-signaling listening on :${port}`);
  console.log(`allowed origins: ${allowed.join(', ')}`);
  console.log(`membership checks: ${requireConversationMembership ? 'enabled' : 'disabled'}`);
});
