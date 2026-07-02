"use client";

import { useEffect } from "react";

export function useSSOCallback(isCustomDomain: boolean) {
  useEffect(() => {
    if (!isCustomDomain || typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const ssoToken = searchParams.get("sso_token");
    if (ssoToken) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("sso_token");
      const callback = cleanUrl.pathname + cleanUrl.search;
      window.location.href = `/api/auth/sso/callback?token=${encodeURIComponent(ssoToken)}&callback=${encodeURIComponent(callback)}`;
    }
  }, [isCustomDomain]);
}
