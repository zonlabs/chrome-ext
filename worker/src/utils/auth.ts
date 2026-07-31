import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { getDb } from "../db";
import * as schema from "../db/schema";

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