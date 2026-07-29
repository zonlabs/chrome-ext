import { Hono } from 'hono';
import { auth } from '../utils/auth';

const TTL = 60 * 60 * 24 * 365;
const kvKey = (userId: string) => `threads:${userId}`;
interface Thread { id: string; title: string; createdAt: number; }
const app = new Hono<{ Bindings: Env }>();

async function getUserId(c: any): Promise<string | null> {
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  return session?.user?.id ?? null;
}
async function readThreads(c: any, userId: string): Promise<Thread[]> {
  const raw = await c.env.CACHE.get(kvKey(userId));
  if (!raw) return [];
  try { return JSON.parse(raw) as Thread[]; } catch { return []; }
}
function validTitle(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 120; }

app.get('/threads', async c => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const threads = await readThreads(c, userId);
  return c.json({ threads: threads.sort((a, b) => b.createdAt - a.createdAt) });
});
app.post('/threads', async c => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'Invalid thread payload' }, 400);
  if ('id' in body) return c.json({ error: 'Client-supplied thread IDs are not allowed' }, 400);
  const title = body.title ?? 'New Chat';
  if (!validTitle(title)) return c.json({ error: 'Invalid thread title' }, 400);
  const thread: Thread = { id: crypto.randomUUID(), title: title.trim(), createdAt: Date.now() };
  const threads = await readThreads(c, userId);
  await c.env.CACHE.put(kvKey(userId), JSON.stringify([thread, ...threads]), { expirationTtl: TTL });
  return c.json({ thread }, 201);
});
app.patch('/threads/:id', async c => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'Invalid thread payload' }, 400);
  if (!validTitle(body.title)) return c.json({ error: 'Invalid thread title' }, 400);
  const id = c.req.param('id'); const threads = await readThreads(c, userId); const index = threads.findIndex(thread => thread.id === id);
  if (index < 0) return c.json({ error: 'Thread not found' }, 404);
  const thread = { ...threads[index], title: body.title.trim() }; threads[index] = thread;
  await c.env.CACHE.put(kvKey(userId), JSON.stringify(threads), { expirationTtl: TTL });
  return c.json({ thread });
});
app.delete('/threads/:id', async c => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const id = c.req.param('id'); const threads = await readThreads(c, userId);
  if (!threads.some(thread => thread.id === id)) return c.json({ error: 'Thread not found' }, 404);
  await c.env.CACHE.put(kvKey(userId), JSON.stringify(threads.filter(thread => thread.id !== id)), { expirationTtl: TTL });
  return c.json({ success: true });
});
export default app;
