/**
 * Client-side bridge for Server Actions in Vite/Hono.
 * Dispatches action calls to the Hono /api/action/:name endpoint with credentials.
 */
export async function invokeAction<T = unknown>(actionName: string, args: unknown[]): Promise<T> {
  const res = await fetch(`/api/action/${encodeURIComponent(actionName)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ args }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok && data?.error) {
      return data as T;
    }
    return data as T;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Action ${actionName} failed with status ${res.status}: ${text}`);
  }

  return (await res.text()) as unknown as T;
}
