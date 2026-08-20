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
  // User self-control: when off, this account's posts are hidden from the global home feed
  // (still reachable via the profile page) — a per-account "stealth" mode.
  publishToFeed: boolean("publish_to_feed").default(true).notNull(),
  // Last time this user published a post — used to sort the friends-circle listing.
  lastPostAt: timestamp("last_post_at", { withTimezone: true }),
  // Platform control (admin): when off, this account's posts never appear in the public home feed.
  displayPermission: boolean("display_permission").default(true).notNull(),
  // User self-control: when off, visiting the profile page only shows basic info + a stealth notice.
  publicHomepage: boolean("public_homepage").default(true).notNull(),
  loginDisabledAt: timestamp("login_disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_telegram_chat_id_idx").on(table.telegramChatId),
  index("users_telegram_bind_token_idx").on(table.telegramBindToken),
  // Hot subquery on every public feed render: which users' posts are visible.
  index("users_publish_display_idx").on(table.publishToFeed, table.displayPermission),
  // Friends-circle listing: displayable users sorted by latest post activity.
  index("users_friends_idx").on(table.displayPermission, table.lastPostAt),
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
  index("sessions_expires_at_idx").on(table.expiresAt),
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
}, (table) => [
  index("verifications_expires_at_idx").on(table.expiresAt),
]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  // mediaUrls is a JSON array: Array<{ type: 'image' | 'video' | 'audio', url: string, name: string, duration?: number, thumbnailUrl?: string }>
  mediaUrls: jsonb("media_urls").default("[]").notNull(),
  // @deprecated: use embedType/embedId instead. Kept for backward compat.
  ytVideoId: text("yt_video_id"),
  // embedType: 'youtube' | 'bilibili' | 'tiktok' | 'spotify' | 'netease' | 'apple-music' | 'apple-podcast' | 'spotify-podcast'
  embedType: text("embed_type"),
  embedId: text("embed_id"),
  // embedMeta: { thumbnailUrl?: string; title?: string } — cached at post-creation to avoid runtime external fetches
  embedMeta: jsonb("embed_meta"),
  status: postStatusEnum("status").default("approved").notNull(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("posts_user_id_idx").on(table.userId),
  index("posts_status_created_at_idx").on(table.status, table.createdAt),
  index("posts_pinned_at_idx").on(table.pinnedAt),
  // User home feed: filter by user + status, ordered by created_at.
  index("posts_user_status_created_idx").on(table.userId, table.status, table.createdAt),
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
  // Feed comment-count stubs: filter by post + visible status.
  index("comments_post_status_idx").on(table.postId, table.status),
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
  // Expired-code cleanup runs at container startup.
  index("verification_codes_expires_at_idx").on(table.expiresAt),
]);

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: jsonb("scopes").default(["posts:write", "upload:write"]).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("api_tokens_user_id_idx").on(table.userId),
  index("api_tokens_token_hash_idx").on(table.tokenHash),
]);

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  reactions: many(reactions),
  apiTokens: many(apiTokens),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
    relationName: "userApiTokens",
  }),
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

