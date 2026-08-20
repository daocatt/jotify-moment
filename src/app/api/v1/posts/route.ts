import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { generateUniquePostId } from "@/app/actions/posts";
import { isAllowedMediaUrl } from "@/lib/storage";
import { getSetting } from "@/lib/settings";
import { invalidateFeedCache } from "@/lib/feed-cache";
import { revalidatePath } from "next/cache";

const MAX_POST_LENGTH = 2000;
const postTracker = new Map<string, { count: number; resetTime: number }>();
const MAX_POSTS_PER_MINUTE = 30;

function checkPostRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = postTracker.get(userId);
  if (!record || now > record.resetTime) {
    postTracker.set(userId, { count: 1, resetTime: now + 60_000 });
    return true;
  }
  if (record.count >= MAX_POSTS_PER_MINUTE) {
    return false;
  }
  record.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateApiRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Invalid or missing API token" }, { status: 401 });
    }

    const { user, token } = auth;

    if (token && !token.scopes.includes("posts:write")) {
      return NextResponse.json({ error: "Forbidden: API token lacks posts:write scope" }, { status: 403 });
    }

    if (user.status === "suspended") {
      return NextResponse.json({ error: "User is suspended" }, { status: 403 });
    }

    if (user.role === "guest") {
      return NextResponse.json({ error: "Guest users cannot create posts" }, { status: 403 });
    }

    if (!checkPostRateLimit(user.id)) {
      return NextResponse.json({ error: "发帖过于频繁，请稍后再试 (Rate limit exceeded)" }, { status: 429 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const content = (typeof body.content === "string" ? body.content : "").trim();
    const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : [];
    const embedType = typeof body.embedType === "string" ? body.embedType : null;
    const embedId = typeof body.embedId === "string" ? body.embedId : null;

    if (!content && mediaUrls.length === 0 && !embedId) {
      return NextResponse.json({ error: "动态内容不能为空 (Content or media is required)" }, { status: 400 });
    }

    if (content.length > MAX_POST_LENGTH) {
      return NextResponse.json({ error: `内容长度不能超过 ${MAX_POST_LENGTH} 字` }, { status: 400 });
    }

    if (mediaUrls.length > 9) {
      return NextResponse.json({ error: "每条动态最多附带 9 个媒体文件" }, { status: 400 });
    }

    const sanitizedMedia = [];
    for (const m of mediaUrls) {
      if (typeof m.url !== "string" || !(await isAllowedMediaUrl(m.url))) {
        return NextResponse.json({ error: "包含未授权或不合规的媒体链接" }, { status: 400 });
      }
      const isThumbAllowed =
        typeof m.thumbnailUrl === "string" ? await isAllowedMediaUrl(m.thumbnailUrl) : false;

      sanitizedMedia.push({
        type: m.type === "video" ? "video" : m.type === "audio" ? "audio" : "image",
        url: m.url,
        name: typeof m.name === "string" ? m.name.slice(0, 100) : "media",
        duration: typeof m.duration === "number" ? m.duration : undefined,
        thumbnailUrl: isThumbAllowed ? m.thumbnailUrl : undefined,
      });
    }

    const requireApproval = (await getSetting("require_approval")) === "true";
    const status = requireApproval && user.role !== "super_admin" && user.role !== "admin" ? "pending" : "approved";

    const id = await generateUniquePostId();

    const [post] = await db
      .insert(posts)
      .values({
        id,
        userId: user.id,
        content,
        mediaUrls: sanitizedMedia,
        embedType,
        embedId,
        status,
      })
      .returning();

    await db
      .update(users)
      .set({ lastPostAt: new Date() })
      .where(eq(users.id, user.id));

    invalidateFeedCache();
    revalidatePath("/");
    if (user.slug) revalidatePath(`/u/${user.slug}`);

    const mainHost = process.env.MAIN_HOST?.split(",")[0]?.trim() || "localhost:3000";
    const betterAuthUrl = process.env.BETTER_AUTH_URL;
    const baseUrl =
      betterAuthUrl && !betterAuthUrl.includes("localhost")
        ? betterAuthUrl.replace(/\/$/, "")
        : !mainHost.includes("localhost") && !mainHost.includes("127.0.0.1")
        ? `https://${mainHost}`
        : "http://localhost:3000";

    return NextResponse.json(
      {
        success: true,
        post: {
          id: post.id,
          url: `${baseUrl}/mo/${post.id}`,
          content: post.content,
          mediaUrls: post.mediaUrls,
          status: post.status,
          createdAt: post.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("[API v1 Posts] Error:", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "发布动态失败", detail }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "15", 10), 1), 50);

    const publicPosts = await db.query.posts.findMany({
      where: eq(posts.status, "approved"),
      orderBy: [desc(posts.createdAt)],
      limit,
      columns: {
        id: true,
        content: true,
        mediaUrls: true,
        embedType: true,
        embedId: true,
        createdAt: true,
      },
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            slug: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      posts: publicPosts,
    });
  } catch (error: unknown) {
    console.error("[API v1 Posts List] Error:", error);
    return NextResponse.json({ error: "获取动态列表失败" }, { status: 500 });
  }
}
