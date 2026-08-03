import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { getDb } from "../db";
import * as schema from "../db/schema";
import type { Context, Next } from 'hono';

type GoogleAuthEnv = Env & {
  ADMIN_USER_IDS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export const auth = (env: Env) => {
  const authEnv = env as GoogleAuthEnv;
  const googleClientId = authEnv.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = authEnv.GOOGLE_CLIENT_SECRET?.trim();
  const adminUserIds = authEnv.ADMIN_USER_IDS
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const db = getDb(env);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      bearer(),
      admin({ adminUserIds }),
      dash(),
    ],
    secret: env.BETTER_AUTH_SECRET,
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : undefined,
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/social': {
          window: 60,
          max: 5,
        },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    trustedOrigins: [
      "https://dash.better-auth.com",
      "chrome-extension://llihcpikannlnjolgcmbebnoihokiffn",
      "http://127.0.0.1:8787",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ],
    user: {
      modelName: "user",
      fields: {
        image: "picture",
      },
      additionalFields: {
        plan: {
          type: "string",
          defaultValue: "free",
        },
      },
    },
  });
};

/** Hono context type for sub-apps whose routes require an authenticated user. */
export type AuthEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
  };
};

/**
 * Hono middleware: rejects requests without a valid session and sets `userId`
 * on the context. Mount before routes so handlers read `c.get('userId')`.
 */
export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('userId', session.user.id);
  await next();
}

/**
 * Authenticates an incoming request for agent routes by inspecting
 * the Authorization header or the token query parameter.
 */
export async function checkAuth(request: Request, env: Env) {
  let token = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!token) {
    try {
      const url = new URL(request.url);
      const queryToken =
        url.searchParams.get('token') ||
        url.searchParams.get('auth_token') ||
        url.searchParams.get('authorization');
      if (queryToken) token = `Bearer ${queryToken.trim()}`;
    } catch {
      // Ignore URL parse errors
    }
  }

  if (!token) return null;

  try {
    const headers = new Headers();
    headers.set('Authorization', token);
    const session = await auth(env).api.getSession({ headers });
    return session?.user ? session : null;
  } catch (err) {
    console.error('[checkAuth error]', err);
    return null;
  }
}

/**
 * Verifies whether the authenticated user owns the requested agent instance.
 */
export async function checkAgentAccess(
  request: Request,
  userId: string,
  env: Env
): Promise<Response | null> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    // /agents/{agent-name}/{instance-name}
    if (parts[0] !== 'agents' || parts.length < 3) {
      return null;
    }

    const agentName = parts[1].toLowerCase();
    const instanceName = parts[2];

    if (agentName === 'user-agent' || agentName === 'useragent') {
      if (instanceName !== `user-${userId}`) {
        return new Response("Forbidden: Cannot access another user's agent", { status: 403 });
      }

      // Check sub-agent thread ownership if path is /agents/user-agent/.../sub/chat-agent/{threadId}
      if (parts.length >= 6 && parts[3] === 'sub') {
        const subAgentName = parts[4].toLowerCase();
        const subInstanceName = parts[5];
        if (subAgentName === 'chat-agent' || subAgentName === 'chatagent') {
          const isOwner = await verifyThreadOwnership(env, userId, subInstanceName);
          if (!isOwner) {
            return new Response('Forbidden: Thread not owned by user', { status: 403 });
          }
        }
      }
    } else if (agentName === 'chat-agent' || agentName === 'chatagent') {
      const isOwner = await verifyThreadOwnership(env, userId, instanceName);
      if (!isOwner) {
        return new Response('Forbidden: Thread not owned by user', { status: 403 });
      }
    }

    return null;
  } catch (err) {
    console.error('[checkAgentAccess error]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Checks KV storage to verify if a thread ID belongs to the specified user.
 */
export async function verifyThreadOwnership(
  env: Env,
  userId: string,
  threadId: string
): Promise<boolean> {
  try {
    const raw = await env.CACHE.get(`threads:${userId}`);
    if (!raw) return false;
    const threads = JSON.parse(raw) as Array<{ id: string }>;
    return Array.isArray(threads) && threads.some((t) => t && t.id === threadId);
  } catch {
    return false;
  }
}