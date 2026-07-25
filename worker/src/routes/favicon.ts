import { Hono } from 'hono';
import { Env } from '../db/schema';

const app = new Hono<{ Bindings: Env }>();

function getRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return hostname;
}

async function tryFetch(url: string, timeoutMs: number): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Obot/1.0)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('Content-Type') || '';
    if (!ct.startsWith('image/')) return null;
    return { buffer: await res.arrayBuffer(), contentType: ct };
  } catch {
    return null;
  }
}

app.get('/favicon', async (c) => {
  const hostname = c.req.query('hostname');
  if (!hostname) {
    return c.body(null, 404);
  }

  const rootDomain = getRootDomain(hostname);
  const hasSubdomain = hostname !== rootDomain;

  if (hasSubdomain) {
    const r = await tryFetch(`https://${hostname}/favicon.ico`, 1500);
    if (r) {
      return c.body(r.buffer, 200, {
        'Content-Type': r.contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      });
    }
  }

  const r = await tryFetch(`https://${rootDomain}/favicon.ico`, 1500);
  if (r) {
    return c.body(r.buffer, 200, {
      'Content-Type': r.contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    });
  }

  const ddg = await tryFetch(`https://icons.duckduckgo.com/ip3/${rootDomain}.ico`, 2000);
  if (ddg) {
    return c.body(ddg.buffer, 200, {
      'Content-Type': ddg.contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    });
  }

  return c.body(null, 404, {
    'Cache-Control': 'public, max-age=86400',
  });
});

export default app;
