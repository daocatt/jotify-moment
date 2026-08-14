/**
 * In-memory sliding-window rate limiter keyed by an arbitrary string (e.g. userId).
 * Not shared across instances — suitable for single-container self-hosting.
 */
export class RateLimiter {
  private map = new Map<string, { count: number; resetAt: number }>();
  private lastTrimAt = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now > entry.resetAt) {
      this.map.set(key, { count: 1, resetAt: now + this.windowMs });
      this.trim(now);
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    this.trim(now);
    return true;
  }

  reset(key: string): void {
    this.map.delete(key);
  }

  private trim(now: number): void {
    if (now - this.lastTrimAt < 60_000) return;
    this.lastTrimAt = now;
    if (this.map.size <= this.maxEntries) return;
    const keys = [...this.map.keys()];
    for (let i = 0; i < keys.length - this.maxEntries; i++) {
      this.map.delete(keys[i]);
    }
  }
}
