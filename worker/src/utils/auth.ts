import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { dash } from "@better-auth/infra";

export const auth = (env: Env) => betterAuth({
  database: env.DB,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [bearer(), dash()],
  secret: env.BETTER_AUTH_SECRET,
  advanced: {
    ipAddress: {
      // Cloudflare sets this header to the original client IP.
      // Avoid falling back to X-Forwarded-For, whose leftmost value can be spoofed.
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  trustedOrigins: ["https://dash.better-auth.com"],
  user: {
    modelName: "users",
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
