import { Suspense } from "react";
import { ResetPasswordClient } from "./reset-password-client";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "重置密码 - Jotify Moment",
  description: "重置您的 Jotify Moment 账号密码",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
          <Loader2 className="animate-spin text-primary size-8" />
        </div>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
