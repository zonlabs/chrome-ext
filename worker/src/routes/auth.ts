import { Hono } from 'hono';
import { Env } from '../db/schema';
import { signJWT, verifyJWT } from '../utils/jwt';

const app = new Hono<{ Bindings: Env }>();

// ── POST /api/auth/google ─────────────────────────────────────────────────────
// Accepts a Google OAuth access token, verifies it, upserts the user in D1,
// and returns a self-signed JWT (no session row needed).
app.post('/auth/google', async (c) => {
  try {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { token } = body;
    if (!token) return c.json({ error: 'Missing token' }, 400);

    // Verify with Google userinfo endpoint (one-time, only at sign-in)
    const verifyRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => '');
      console.error('Google token verification failed', verifyRes.status, errText.slice(0, 500));
      return c.json({ error: 'Google sign-in failed', detail: { status: verifyRes.status } }, 401);
    }

    const googleUser: any = await verifyRes.json();
    if (!googleUser.email) return c.json({ error: 'Email not available from Google' }, 401);

    const name    = googleUser.name    || googleUser.email.split('@')[0];
    const picture = googleUser.picture || null;

    // Upsert user in D1 (only for user records — no session row)
    const existing: any = await c.env.DB.prepare(
      'SELECT id, plan FROM users WHERE email = ?'
    ).bind(googleUser.email).first();

    let userId: string;
    let plan: string;

    if (existing) {
      userId = existing.id;
      plan   = existing.plan ?? 'free';
      await c.env.DB.prepare(
        'UPDATE users SET name = ?, picture = ? WHERE id = ?'
      ).bind(name, picture, userId).run();
    } else {
      userId = crypto.randomUUID();
      plan   = 'free';
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, name, picture, plan) VALUES (?, ?, ?, ?, ?)'
      ).bind(userId, googleUser.email, name, picture, plan).run();
    }

    // Issue a self-signed JWT — no session row, stateless
    const jwt = await signJWT(
      { sub: userId, email: googleUser.email, name, picture, plan },
      c.env.JWT_SECRET,
    );

    return c.json({
      jwt,
      user: { id: userId, email: googleUser.email, name, picture, plan },
    });
  } catch (err) {
    console.error('Auth error:', err);
    return c.json({ error: `Internal error: ${(err as Error).message}` }, 500);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Stateless — client just discards the JWT. Nothing to do server-side.
app.post('/auth/logout', async (_c) => {
  return _c.json({ success: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Validates the JWT from the Authorization header and returns the user claims.
app.get('/auth/me', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return c.json({ user: null });

  const claims = await verifyJWT(token, c.env.JWT_SECRET);
  if (!claims) return c.json({ user: null });

  return c.json({
    user: {
      id:      claims.sub,
      email:   claims.email,
      name:    claims.name,
      picture: claims.picture,
      plan:    claims.plan,
    },
  });
});

export default app;
