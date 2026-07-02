import type { Metadata } from "next";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getUserBySlugAction } from "@/app/actions/posts";
import { UserHomeClient } from "./user-home-client";

export const dynamic = "force-dynamic";

function plainExcerpt(content: string, max = 80): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*`>_~]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const res = await getUserBySlugAction(slug);
  if (!("user" in res) || !res.user) return {};

  const user = res.user;
  let description = user.bio || "";

  const latest = await db.query.posts.findFirst({
    where: and(eq(posts.userId, user.id), eq(posts.status, "approved")),
    orderBy: [desc(posts.createdAt)],
    columns: { content: true },
  });
  if (latest?.content) {
    const excerpt = plainExcerpt(latest.content);
    description = (description ? description + " " : "") + excerpt;
  }

  return {
    title: user.name,
    description: description || `${user.name} 的个人主页`,
  };
}

import { headers } from "next/headers";

export default async function UserHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const headersList = await headers();
  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  return <UserHomeClient slug={slug} isCustomDomain={isCustomDomain} mainHost={mainHost} />;
}