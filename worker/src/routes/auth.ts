import { Hono } from 'hono';
import { auth } from '../utils/auth';
import { getAuthSuccessHtml } from '../templates/authSuccess';

const app = new Hono<{ Bindings: Env }>();

// ── POST /api/auth/google ─────────────────────────────────────────────────────
// Accepts a Google OAuth access token, verifies it, creates/updates the user
// via Better Auth's internal adapter, creates a session, and returns the session token.
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

    // Verify token with Google userinfo endpoint
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

    const name = googleUser.name || googleUser.email.split('@')[0];
    const picture = googleUser.picture || null;

    const authInstance = auth(c.env);
    const authCtx = await authInstance.$context;

    // Check if user exists using Better Auth internal adapter
    const existing = await authCtx.internalAdapter.findUserByEmail(googleUser.email);

    let user: any;
    let plan = 'free';

    if (existing && existing.user) {
      user = existing.user;
      plan = user.plan || 'free';
      user = await authCtx.internalAdapter.updateUser(user.id, {
        name,
        image: picture,
      });
    } else {
      user = await authCtx.internalAdapter.createUser({
        email: googleUser.email,
        name,
        image: picture,
        emailVerified: true,
        plan: 'free',
      });
    }

    // Create session in Better Auth
    const session = await authCtx.internalAdapter.createSession(user.id, false);

    return c.json({
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.image || picture,
        plan,
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    return c.json({ error: `Internal error: ${(err as Error).message}` }, 500);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Revokes the active session token in the database
app.post('/auth/logout', async (c) => {
  try {
    const authHeader = c.req.header('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const authInstance = auth(c.env);
      await authInstance.api.revokeSession({
        body: { token },
        headers: c.req.raw.headers,
      });
    }
    return c.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return c.json({ error: `Internal error: ${(err as Error).message}` }, 500);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Validates the session token from the Authorization header and returns the user.
app.get('/auth/me', async (c) => {
  try {
    const authInstance = auth(c.env);
    const session = await authInstance.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) return c.json({ user: null });

    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        picture: session.user.image || null,
        plan: (session.user as any).plan || 'free',
      },
    });
  } catch (err) {
    console.error('Auth check error:', err);
    return c.json({ user: null });
  }
});

/** ── GET /api/auth/callback ────────────────────────────────────────────────────
*   OAuth success landing page. Served after the McpAgent DO completes the MCP
*   OAuth code exchange and redirects to successRedirect: '/api/auth/callback'.
*/
app.get('/auth/callback', (c) => {
  return c.html(getAuthSuccessHtml());
});

export default app;
