export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
      ...init,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(init?.headers || {}),
      },
    });
  }

  static redirect(url: string | URL, status = 307) {
    return new Response(null, {
      status,
      headers: { Location: typeof url === "string" ? url : url.toString() },
    });
  }

  static next() {
    return new Response(null);
  }

  cookies = {
    set: (_name: string, _value: string, _options?: Record<string, unknown>) => {},
    delete: (_name: string) => {},
  };
}

export type NextRequest = Request;
