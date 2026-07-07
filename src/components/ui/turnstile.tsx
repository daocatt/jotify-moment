"use client";

import { useEffect, useRef } from "react";

interface TurnstileProps {
  sitekey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  languageOverride?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          language?: string;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ sitekey, onVerify, onExpire, languageOverride }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const scriptId = "cloudflare-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      if (containerRef.current && window.turnstile) {
        if (widgetIdRef.current) return;
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey,
            callback: onVerify,
            "expired-callback": onExpire,
            language: languageOverride || "zh-cn",
          });
        } catch (err) {
          console.error("Failed to render Cloudflare Turnstile:", err);
        }
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => {
        clearInterval(interval);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [sitekey, onVerify, onExpire, languageOverride]);

  return <div ref={containerRef} />;
}
