import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export const metadata = {
  title: "个人设置",
  description: "管理个人资料、隐私与 API 密钥",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#F4F4F5] dark:bg-zinc-950 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <SettingsClient user={currentUser} />
      </div>
    </main>
  );
}
