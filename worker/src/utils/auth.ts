import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

export const auth = (env: Env) => betterAuth({
  database: env.DB,
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
