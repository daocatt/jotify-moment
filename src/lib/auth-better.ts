import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      status: {
        type: "string",
        defaultValue: "active",
      },
      bio: {
        type: "string",
        required: false,
      },
      coverImage: {
        type: "string",
        required: false,
      },
      wechat: {
        type: "string",
        required: false,
      },
      telegram: {
        type: "string",
        required: false,
      },
      github: {
        type: "string",
        required: false,
      },
      x: {
        type: "string",
        required: false,
      },
      otherLink: {
        type: "string",
        required: false,
      },
    },
  },
});
