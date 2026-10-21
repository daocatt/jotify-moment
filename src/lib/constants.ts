export const MIN_PASSWORD_LENGTH = 8;

export const SESSION_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * OAuth2 授权码有效期（60 秒）。
 *
 * 真源只有这一处，两边都引用它：
 * - `api/auth/oauth2/authorize` 签发时**写入** expiresAt = now + CODE_EXPIRY_MS；
 * - `api/auth/oauth2/token` 核销时校验 expiresAt 尚未过期。
 *
 * 之前两个路由各写一份 60_000，token 那份还没被用上 —— 一份用在签发、
 * 一份只用于校验，两边数值一旦漂移，「签出来的码能活多久」就会取决于
 * 谁写的那个值，而看代码时两边都叫 CODE_EXPIRY_MS，极难发现。
 */
export const OAUTH_CODE_EXPIRY_MS = 60_000;

/** 授权码随机字节数（hex 后 64 字符） */
export const OAUTH_CODE_LENGTH = 32;
