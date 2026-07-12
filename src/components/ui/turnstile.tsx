"use client";

import { useEffect, useRef, useCallback } from "react";

interface TurnstileProps {
  sitekey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: string) => void;
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
          "error-callback"?: (error: string) => void;
          language?: string;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_LOAD_TIMEOUT = 15_000;
const POLL_INTERVAL = 100;

export function Turnstile({ sitekey, onVerify, onExpire, onError, languageOverride }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  const removeWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, []);

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
            callback: (token: string) => onVerifyRef.current(token),
            "expired-callback": () => onExpireRef.current?.(),
            "error-callback": (error: string) => onErrorRef.current?.(error),
            language: languageOverride || "zh-cn",
          });
        } catch (err) {
          onErrorRef.current?.(err instanceof Error ? err.message : "render_failed");
        }
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += POLL_INTERVAL;
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        } else if (elapsed >= SCRIPT_LOAD_TIMEOUT) {
          clearInterval(interval);
          onErrorRef.current?.("script_load_timeout");
        }
      }, POLL_INTERVAL);

      return () => {
        clearInterval(interval);
        removeWidget();
      };
    }

    return () => {
      removeWidget();
    };
  }, [sitekey, languageOverride, removeWidget]);

  return <div ref={containerRef} />;
}
