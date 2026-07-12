import type { Metadata } from "next";
import { getPostByIdAction } from "@/app/actions/posts";
import { MoClient } from "./mo-client";

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
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await getPostByIdAction(id);
  if (!("post" in res) || !res.post) return {};

  const post = res.post;
  const excerpt = plainExcerpt(post.content);
  const firstImage = post.mediaUrls.find((m) => m.type === "image")?.url;

  return {
    title: `${post.user.name} 的 Moment`,
    description: excerpt || "查看 Moment 详情",
    openGraph: {
      title: `${post.user.name} 的 Moment`,
      description: excerpt || "查看 Moment 详情",
      type: "article",
      images: firstImage ? [{ url: firstImage }] : undefined,
    },
    twitter: {
      card: firstImage ? "summary_large_image" : "summary",
      title: `${post.user.name} 的 Moment`,
      description: excerpt || "查看 Moment 详情",
      images: firstImage ? [firstImage] : undefined,
    },
  };
}

import { headers } from "next/headers";

export default async function MomentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headersList = await headers();
  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  return <MoClient id={id} isCustomDomain={isCustomDomain} mainHost={mainHost} />;
}
