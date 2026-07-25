import { Hono } from 'hono';
import { Env } from '../db/schema';
import { verifyJWT } from '../utils/jwt';

// KV key pattern: threads:<userId>
const kvKey = (userId: string) => `threads:${userId}`;

interface Thread {
  id: string;
  title: string;
  createdAt: number;
}

const app = new Hono<{ Bindings: Env }>();

// ── Auth helper ───────────────────────────────────────────────────────────────
// Extracts and verifies the JWT from "Authorization: Bearer <token>".
// Returns the userId (sub claim) on success, null otherwise.
async function getUserId(c: any): Promise<string | null> {
  const authHeader: string = c.req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const claims = await verifyJWT(token, c.env.JWT_SECRET);
  return claims?.sub ?? null;
}

// ── GET /api/threads ──────────────────────────────────────────────────────────
app.get('/threads', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ threads: [] });

  const raw = await c.env.CACHE.get(kvKey(userId));
  if (!raw) return c.json({ threads: [] });

  try {
    const threads = JSON.parse(raw) as Thread[];
    threads.sort((a, b) => b.createdAt - a.createdAt);
    return c.json({ threads });
  } catch {
    return c.json({ threads: [] });
  }
});

// ── POST /api/threads ─────────────────────────────────────────────────────────
app.post('/threads', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  let body: Partial<Thread>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!body.id || !body.title) return c.json({ error: 'Missing id or title' }, 400);

  const raw = await c.env.CACHE.get(kvKey(userId));
  let threads: Thread[] = [];
  if (raw) { try { threads = JSON.parse(raw); } catch {} }

  const idx = threads.findIndex(t => t.id === body.id);
  if (idx !== -1) {
    threads[idx].title = body.title!;
  } else {
    threads.push({ id: body.id!, title: body.title!, createdAt: body.createdAt ?? Date.now() });
  }

  await c.env.CACHE.put(kvKey(userId), JSON.stringify(threads), {
    expirationTtl: 60 * 60 * 24 * 365,
  });

  return c.json({ success: true });
});

// ── DELETE /api/threads/:id ───────────────────────────────────────────────────
app.delete('/threads/:id', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const threadId = c.req.param('id');
  const raw = await c.env.CACHE.get(kvKey(userId));
  let threads: Thread[] = [];
  if (raw) { try { threads = JSON.parse(raw); } catch {} }

  threads = threads.filter(t => t.id !== threadId);
  await c.env.CACHE.put(kvKey(userId), JSON.stringify(threads), {
    expirationTtl: 60 * 60 * 24 * 365,
  });

  return c.json({ success: true });
});

export default app;
