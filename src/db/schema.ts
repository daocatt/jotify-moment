import { pgTable, uuid, text, timestamp, jsonb, pgEnum, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("user_role", ["super_admin", "admin", "user", "guest"]);
export const statusEnum = pgEnum("user_status", ["active", "suspended"]);
export const postStatusEnum = pgEnum("post_status", ["approved", "pending"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  avatar: text("avatar"),
  bio: text("bio"),
  coverImage: text("cover_image"),
  wechat: text("wechat"),
  telegram: text("telegram"),
  telegramChatId: text("telegram_chat_id"),
  telegramBindToken: text("telegram_bind_token"),
  github: text("github"),
  x: text("x"),
  otherLink: text("other_link"),
  role: roleEnum("role").default("user").notNull(),
  status: statusEnum("status").default("active").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  theme: text("theme"),
  customDomain: text("custom_domain").unique(),
  allowCustomDomain: boolean("allow_custom_domain").default(false).notNull(),
  loginDisabledAt: timestamp("login_disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("users_telegram_chat_id_idx").on(table.telegramChatId),
  index("users_telegram_bind_token_idx").on(table.telegramBindToken),
]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("accounts_user_provider_idx").on(table.userId, table.providerId),
]);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  // mediaUrls is a JSON array: Array<{ type: 'image' | 'video' | 'audio', url: string, name: string, duration?: number }>
  mediaUrls: jsonb("media_urls").default("[]").notNull(),
  ytVideoId: text("yt_video_id"),
  status: postStatusEnum("status").default("approved").notNull(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("posts_user_id_idx").on(table.userId),
  index("posts_status_created_at_idx").on(table.status, table.createdAt),
  index("posts_pinned_at_idx").on(table.pinnedAt),
]);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("comments_post_id_idx").on(table.postId),
  index("comments_user_id_idx").on(table.userId),
]);

export const reactions = pgTable("reactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("reactions_post_id_idx").on(table.postId),
  index("reactions_user_id_idx").on(table.userId),
  uniqueIndex("reactions_post_user_emoji_idx").on(table.postId, table.userId, table.emoji),
]);

export const userPinned = pgTable("user_pinned", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  postId: text("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("user_pinned_user_id_idx").on(table.userId),
  uniqueIndex("user_pinned_user_post_idx").on(table.userId, table.postId),
]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentCount: text("sent_count").default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("verification_codes_email_idx").on(table.email),
  index("verification_codes_lookup_idx").on(table.email, table.code, table.type),
  uniqueIndex("verification_codes_type_code_idx").on(table.type, table.code),
]);

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  reactions: many(reactions),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
    relationName: "postAuthor",
  }),
  comments: many(comments),
  reactions: many(reactions),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
    relationName: "postComments",
  }),
  author: one(users, {
    fields: [comments.userId],
    references: [users.id],
    relationName: "commentAuthor",
  }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  post: one(posts, {
    fields: [reactions.postId],
    references: [posts.id],
    relationName: "postReactions",
  }),
  author: one(users, {
    fields: [reactions.userId],
    references: [users.id],
    relationName: "reactionAuthor",
  }),
}));
