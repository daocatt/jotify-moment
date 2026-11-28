import type { Metadata } from "next";
import { AuthPageClient } from "@/app/auth/auth-page-client";

export const metadata: Metadata = {
  title: "注册 - Jotify Moment",
  description: "注册新账户加入 Jotify Moment",
};

export default function RegisterPage() {
  return <AuthPageClient initialMode="register" />;
}
