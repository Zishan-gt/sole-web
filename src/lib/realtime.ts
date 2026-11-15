import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { adminAuth } from './firebase-admin.ts';
import { db } from '../db/index.ts';
import { notifications, profiles } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

interface ClientSocket {
  ws: WebSocket;
  profileId: string | null;
  role: string | null;
}

const clients = new Set<ClientSocket>();

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      // Ignore malformed upgrade URLs
    }
  });

  wss.on('connection', async (ws, req) => {
    const client: ClientSocket = { ws, profileId: null, role: null };
    clients.add(client);

    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        const decoded = await adminAuth.verifyIdToken(token);
        const [prof] = await db
          .select({ id: profiles.id, role: profiles.role })
          .from(profiles)
          .where(eq(profiles.uid, decoded.uid))
          .limit(1);
        if (prof) {
          client.profileId = prof.id;
          client.role = prof.role;
        }
      }
    } catch {
      // Anonymous listener permitted for public broadcasts
    }

    ws.send(JSON.stringify({ event: 'connected', ts: Date.now() }));

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const decoded = await adminAuth.verifyIdToken(msg.token);
          const [prof] = await db
            .select({ id: profiles.id, role: profiles.role })
            .from(profiles)
            .where(eq(profiles.uid, decoded.uid))
            .limit(1);
          if (prof) {
            client.profileId = prof.id;
            client.role = prof.role;
            ws.send(JSON.stringify({ event: 'auth:ok', profileId: prof.id }));
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  return wss;
}

export async function createAndPushNotification(params: {
  recipientId: string;
  businessId?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    const [saved] = await db
      .insert(notifications)
      .values({
        recipientId: params.recipientId,
        businessId: params.businessId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link ?? '',
        isRead: false,
      })
      .returning();

    const payload = JSON.stringify({
      event: 'notification:new',
      notification: saved,
    });

    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN && c.profileId === params.recipientId) {
        c.ws.send(payload);
      }
    }
    return saved;
  } catch (err) {
    console.error('Failed to push notification:', err);
    return null;
  }
}

export function broadcastActivity(event: string, data: Record<string, unknown>) {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

export function sendToProfile(profileId: string, payloadObj: Record<string, unknown>) {
  const payload = JSON.stringify({ ...payloadObj, ts: Date.now() });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN && c.profileId === profileId) {
      c.ws.send(payload);
    }
  }
}

export async function notifyAdmins(params: {
  businessId?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    const adminProfiles = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, 'admin'));

    for (const adm of adminProfiles) {
      await createAndPushNotification({
        recipientId: adm.id,
        businessId: params.businessId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link,
      });
    }
  } catch (err) {
    console.error('Failed to notify admins:', err);
  }
}
