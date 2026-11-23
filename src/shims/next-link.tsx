import * as React from "react";
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router-dom";
import { resolveCustomDomainTarget } from "./next-navigation";

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string | { pathname?: string; query?: Record<string, string> };
  children?: React.ReactNode;
  prefetch?: boolean;
}

export default function Link({ href, children, ...props }: LinkProps) {
  const rawTarget = typeof href === "string" ? href : href?.pathname || "/";
  const resolved = resolveCustomDomainTarget(rawTarget);

  if (resolved.external) {
    return (
      <a {...props} href={resolved.target}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink {...(props as unknown as RouterLinkProps)} to={resolved.target}>
      {children}
    </RouterLink>
  );
}
