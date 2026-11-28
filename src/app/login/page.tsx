import type { Metadata } from "next";
import { AuthPageClient } from "@/app/auth/auth-page-client";

export const metadata: Metadata = {
  title: "登录 - Jotify Moment",
  description: "登录您的 Jotify Moment 账户",
};

export default function LoginPage() {
  return <AuthPageClient initialMode="login" />;
}
