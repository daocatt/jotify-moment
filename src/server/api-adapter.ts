import type { Context } from "hono";
import { setServerContext, getOutgoingCookies } from "@/shims/next-headers";

export function toHonoHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: any, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>
) {
  return async (c: Context) => {
    const cookieMap = new Map<string, string>();
    const cookieHeader = c.req.header("cookie") || "";
    cookieHeader.split(";").forEach((pair) => {
      const [k, ...v] = pair.trim().split("=");
      if (k) cookieMap.set(k, decodeURIComponent(v.join("=")));
    });

    setServerContext(c.req.raw.headers, cookieMap);

    const paramsPromise = Promise.resolve(c.req.param());
    const res = await handler(c.req.raw, { params: paramsPromise });

    const outgoing = getOutgoingCookies();
    if (outgoing.length > 0) {
      const newHeaders = new Headers(res.headers);
      outgoing.forEach((cookieStr) => {
        newHeaders.append("set-cookie", cookieStr);
      });
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    }

    return res;
  };
}
