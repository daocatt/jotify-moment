import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminConsoleClient } from "./admin-console-client";

export const metadata = {
  title: "系统控制台 - Moment",
  description: "系统设置、待审核发布与用户管理",
};

export const dynamic = "force-dynamic";

export default async function AdminConsolePage() {
  const currentUser = await getSessionUser();

  // Guard: Only allow super_admin and admin to access
  if (!currentUser || (currentUser.role !== "super_admin" && currentUser.role !== "admin")) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#F4F4F5] dark:bg-zinc-950 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <AdminConsoleClient currentUser={currentUser} />
      </div>
    </main>
  );
}
