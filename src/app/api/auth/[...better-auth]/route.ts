import { auth } from "@/lib/auth-better";
import { NextRequest, NextResponse } from "next/server";

const SENSITIVE_USER_KEYS = new Set(["telegramChatId", "telegramBindToken", "emailVerified"]);

async function sanitizeResponse(response: Response): Promise<Response> {
  const url = new URL(response.url || "");
  if (!url.pathname.endsWith("/get-session")) return response;

  try {
    const data = await response.json();
    if (data?.user) {
      for (const key of SENSITIVE_USER_KEYS) {
        delete data.user[key];
      }
    }
    return NextResponse.json(data, { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export async function GET(req: NextRequest) {
  const res = await auth.handler(req);
  return sanitizeResponse(res);
}

export const POST = auth.handler;
