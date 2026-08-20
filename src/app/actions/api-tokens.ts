"use server";

import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";

export interface ApiTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * List all API tokens for the currently authenticated user.
 */
export async function getApiTokensAction(): Promise<{
  success?: boolean;
  tokens?: ApiTokenItem[];
  error?: string;
}> {
  const user = await getSessionUser();
  if (!user || user.role === "guest") {
    return { error: "请先登录账号" };
  }

  try {
    const list = await db.query.apiTokens.findMany({
      where: eq(apiTokens.userId, user.id),
      orderBy: [desc(apiTokens.createdAt)],
      columns: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      tokens: list.map((t) => ({
        ...t,
        scopes: (t.scopes as string[]) || ["posts:write", "upload:write"],
      })),
    };
  } catch (err) {
    console.error("[ApiTokens] Failed to list tokens:", err);
    return { error: "获取 API 密钥列表失败" };
  }
}

/**
 * Create a new API token for the current user.
 * Returns the plain token ONCE.
 */
export async function createApiTokenAction(params: {
  name: string;
  scopes?: string[];
  expiresInDays?: number; // 0 or undefined for never
}): Promise<{
  success?: boolean;
  token?: string;
  item?: ApiTokenItem;
  error?: string;
}> {
  const user = await getSessionUser();
  if (!user || user.role === "guest") {
    return { error: "请先登录账号" };
  }

  const name = params.name.trim();
  if (!name) {
    return { error: "密钥名称不能为空" };
  }

  const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : ["posts:write", "upload:write"];

  // Generate plain token: jotify_pat_32bytes_hex
  const randomHex = crypto.randomBytes(24).toString("hex");
  const plainToken = `jotify_pat_${randomHex}`;
  const tokenPrefix = plainToken.slice(0, 16) + "…" + plainToken.slice(-4);
  const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");

  const expiresAt =
    params.expiresInDays && params.expiresInDays > 0
      ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  try {
    const [inserted] = await db
      .insert(apiTokens)
      .values({
        userId: user.id,
        name,
        tokenPrefix,
        tokenHash,
        scopes,
        expiresAt,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopes: apiTokens.scopes,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      });

    return {
      success: true,
      token: plainToken,
      item: {
        ...inserted,
        scopes: inserted.scopes as string[],
      },
    };
  } catch (err) {
    console.error("[ApiTokens] Failed to create token:", err);
    return { error: "创建 API 密钥失败" };
  }
}

/**
 * Revoke / Delete an API token by ID.
 */
export async function revokeApiTokenAction(tokenId: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  const user = await getSessionUser();
  if (!user || user.role === "guest") {
    return { error: "请先登录账号" };
  }

  try {
    await db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, user.id)));

    return { success: true };
  } catch (err) {
    console.error("[ApiTokens] Failed to revoke token:", err);
    return { error: "撤销 API 密钥失败" };
  }
}
