import { serialize } from "cookie";

let currentHeaders: Headers | null = null;
let currentCookies: Map<string, string> | null = null;
let outgoingCookies: string[] = [];

export function setServerContext(reqHeaders?: Headers, reqCookies?: Map<string, string>) {
  currentHeaders = reqHeaders || null;
  currentCookies = reqCookies || null;
  outgoingCookies = [];
}

export function getOutgoingCookies(): string[] {
  return [...outgoingCookies];
}

export async function headers(): Promise<Headers> {
  return currentHeaders || new Headers();
}

export async function cookies() {
  return {
    get(name: string) {
      const val = currentCookies?.get(name);
      return val ? { name, value: val } : undefined;
    },
    getAll() {
      if (!currentCookies) return [];
      return Array.from(currentCookies.entries()).map(([name, value]) => ({ name, value }));
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      if (currentCookies) {
        currentCookies.set(name, value);
      }
      try {
        const cookieStr = serialize(name, value, {
          path: "/",
          sameSite: "lax",
          ...(options as unknown as Parameters<typeof serialize>[2]),
        });
        outgoingCookies.push(cookieStr);
      } catch {
        outgoingCookies.push(`${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`);
      }
    },
    delete(name: string) {
      if (currentCookies) {
        currentCookies.delete(name);
      }
      outgoingCookies.push(`${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`);
    },
  };
}
