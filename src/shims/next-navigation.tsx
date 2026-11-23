import {
  useNavigate,
  useLocation,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

export function resolveCustomDomainTarget(url: string): { external: boolean; target: string } {
  if (typeof window !== "undefined") {
    const winData = (window as unknown as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__;
    if (winData?.isCustomDomain) {
      const slug = ((winData.customDomainSlug || winData.slug) as string) || "";
      const mainHost = (winData.mainHost as string) || "";
      const pathname = url.split("?")[0].split("#")[0];
      const suffix = url.slice(pathname.length);

      if (slug && pathname === `/u/${slug}`) {
        return { external: false, target: `/${suffix}` };
      }
      if (
        pathname === "/" ||
        pathname === "/pinned" ||
        (slug && pathname === `/u/${slug}/pinned`) ||
        pathname.startsWith("/mo/")
      ) {
        return { external: false, target: url };
      }
      if (mainHost && url.startsWith("/")) {
        return { external: true, target: `${window.location.protocol}//${mainHost}${url}` };
      }
    }
  }
  return { external: false, target: url };
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (url: string) => {
      const resolved = resolveCustomDomainTarget(url);
      if (resolved.external) {
        window.location.href = resolved.target;
      } else {
        navigate(resolved.target);
      }
    },
    replace: (url: string) => {
      const resolved = resolveCustomDomainTarget(url);
      if (resolved.external) {
        window.location.replace(resolved.target);
      } else {
        navigate(resolved.target, { replace: true });
      }
    },
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("app:refresh"));
      }
    },
    prefetch: () => {},
  };
}

export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

export function useParams<T extends Record<string, string>>(): T {
  return useRouterParams() as unknown as T;
}

export function redirect(url: string) {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}

export function notFound() {
  throw new Error("NEXT_NOT_FOUND");
}
