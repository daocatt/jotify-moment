import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
    });
    return NextResponse.json({ hasAdmin: !!adminUser });
  } catch (error) {
    return NextResponse.json({ hasAdmin: false, error: "Database error" }, { status: 500 });
  }
}
