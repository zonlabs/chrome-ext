import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

export const auth = (env: Env) => betterAuth({
  database: env.DB,
  baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
  plugins: [bearer()],
  secret: env.BETTER_AUTH_SECRET,
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
