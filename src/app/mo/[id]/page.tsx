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
  const mediaUrls = post.mediaUrls as Array<{ type: string; url: string }> | undefined;
  const firstImage = mediaUrls?.find((m) => m.type === "image")?.url;

  return {
    title: `${post.user.name} 的 Moment`,
    description: excerpt || "查看 Moment 详情",
    alternates: {
      canonical: `/mo/${id}`,
    },
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
  const [res, headersList] = await Promise.all([
    getPostByIdAction(id),
    headers(),
  ]);

  const isCustomDomain = headersList.get("x-custom-domain") === "true";
  const mainHost = process.env.MAIN_HOST?.split(",")[0] || "localhost:3000";

  const nonce = headersList.get("x-nonce") ?? undefined;

  const initialPost = "post" in res && res.post ? res.post : null;
  const initialError = "error" in res && res.error ? res.error : (!initialPost ? "日志不存在或已被删除" : null);

  let jsonLd = null;
  if (initialPost) {
    const mediaUrls = initialPost.mediaUrls as Array<{ type: string; url: string }> | undefined;
    const images = mediaUrls?.filter((m) => m.type === "image").map((m) => m.url) || [];
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "SocialMediaPosting",
      "headline": plainExcerpt(initialPost.content, 50),
      "articleBody": initialPost.content,
      "datePublished": initialPost.createdAt,
      "author": {
        "@type": "Person",
        "name": initialPost.user?.name,
        "image": initialPost.user?.avatar,
      },
      "image": images.length > 0 ? images : undefined,
    };
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <MoClient
        id={id}
        isCustomDomain={isCustomDomain}
        mainHost={mainHost}
        initialPost={initialPost}
        initialError={initialError}
      />
    </>
  );
}
