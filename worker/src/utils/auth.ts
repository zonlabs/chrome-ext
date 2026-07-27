import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { dash } from "@better-auth/infra";

export const auth = (env: Env) => betterAuth({
  database: env.DB,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [bearer(), dash()],
  secret: env.BETTER_AUTH_SECRET,
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
