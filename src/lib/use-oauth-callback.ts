"use client";

import { useEffect } from "react";

export function useOAuthCallback(isCustomDomain: boolean) {
  useEffect(() => {
    if (!isCustomDomain || typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    if (!code) return;

    const state = searchParams.get("state") || "/";
    const callbackUrl = `/api/auth/oauth2/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    window.location.href = callbackUrl;
  }, [isCustomDomain]);
}
