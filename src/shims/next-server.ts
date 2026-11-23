import { serialize, type CookieSerializeOptions } from "cookie";

export class NextResponse extends Response {
  cookies = {
    set: (name: string, value: string, options?: CookieSerializeOptions) => {
      const opts: CookieSerializeOptions = {
        path: "/",
        ...(options || {}),
      };
      if (typeof options?.maxAge === "number") {
        opts.maxAge = options.maxAge;
      }
      if (options?.expires instanceof Date) {
        opts.expires = options.expires;
      }
      const cookieStr = serialize(name, value, opts);
      this.headers.append("Set-Cookie", cookieStr);
    },
    delete: (name: string) => {
      const cookieStr = serialize(name, "", { path: "/", maxAge: 0 });
      this.headers.append("Set-Cookie", cookieStr);
    },
  };

  static json(data: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(init?.headers || {}),
      },
    });
  }

  static redirect(url: string | URL, status = 307) {
    return new NextResponse(null, {
      status,
      headers: { Location: typeof url === "string" ? url : url.toString() },
    });
  }

  static next() {
    return new NextResponse(null);
  }
}

export type NextRequest = Request;
