import crypto from "crypto";

export interface DalaoPendingPayload {
  accountId: string;
  username: string;
  email?: string;
  timestamp: number;
}

export function getDalaoOAuthConfig(requestUrl?: string) {
  const clientId = process.env.DALAO_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.DALAO_OAUTH_CLIENT_SECRET || "";

  let redirectUri = process.env.DALAO_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    const baseUrl = process.env.BETTER_AUTH_URL || (requestUrl ? new URL(requestUrl).origin : "http://localhost:3000");
    redirectUri = `${baseUrl.replace(/\/$/, "")}/api/auth/dalao/callback`;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    authorizeUrl: "https://www.dalao.net/oauth-authorize.htm",
    tokenUrl: "https://www.dalao.net/oauth-token.htm",
    userInfoUrl: "https://www.dalao.net/oauth-userinfo.htm",
  };
}

export function generateRandomState(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getSigningSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET must be configured");
  }
  return secret;
}

/**
 * Sign a pending OAuth payload into an HMAC-protected token.
 */
export function signPendingPayload(payload: DalaoPendingPayload): string {
  const secret = getSigningSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${hmac}`;
}

/**
 * Verify and decode an HMAC-protected pending token. Returns null if invalid or expired.
 */
export function verifyPendingPayload(token: string, maxAgeMs = 15 * 60 * 1000): DalaoPendingPayload | null {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;

    const secret = getSigningSecret();
    const expectedHmac = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as DalaoPendingPayload;
    if (!payload || !payload.accountId || !payload.timestamp) return null;

    if (Date.now() - payload.timestamp > maxAgeMs) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Exchange authorization code for access_token with Dalao OAuth server.
 */
export async function exchangeDalaoCode(code: string, redirectUri: string) {
  const { clientId, clientSecret, tokenUrl } = getDalaoOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Dalao OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token exchange failed with HTTP ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Invalid token response from Dalao: ${JSON.stringify(data)}`);
  }

  return data as {
    access_token: string;
    token_type: string;
    expires_in?: number;
    scope?: string;
  };
}

/**
 * Fetch user info from Dalao OAuth userinfo endpoint.
 */
export async function fetchDalaoUserInfo(accessToken: string) {
  const { userInfoUrl } = getDalaoOAuthConfig();
  const res = await fetch(userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Userinfo request failed with HTTP ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return data as {
    sub?: string | number;
    id?: string | number;
    username?: string;
    email?: string;
    scope?: string;
  };
}
