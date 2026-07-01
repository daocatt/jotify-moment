import type { Metadata } from "next";
import { getSuperAdminProfileAction } from "@/app/actions/posts";
import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const res = await getSuperAdminProfileAction();
  if ("user" in res && res.user) {
    return {
      title: res.user.name,
      description: res.user.bio || `${res.user.name} 的个人主页`,
    };
  }
  return {};
}

export default async function Home() {
  const res = await getSuperAdminProfileAction();
  const superAdmin = "user" in res && res.user ? res.user : null;
  return <HomeClient initialSuperAdmin={superAdmin} />;
}