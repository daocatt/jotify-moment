import * as React from "react";
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router-dom";

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string | { pathname?: string; query?: Record<string, string> };
  children?: React.ReactNode;
  prefetch?: boolean;
}

export default function Link({ href, children, ...props }: LinkProps) {
  const target = typeof href === "string" ? href : href?.pathname || "/";
  return (
    <RouterLink {...(props as unknown as RouterLinkProps)} to={target}>
      {children}
    </RouterLink>
  );
}
