// Login lives on the homepage (wodnjs.com). The browser sends the homepage session cookie (wj_session)
// to /omok as well, and this module asks the homepage server who it belongs to.
import { timingSafeEqual, createHash } from 'node:crypto';

export interface HomeUser { id: string; name: string; nickname: string }
export type VerifySession = ((cookieHeader: string | undefined) => Promise<HomeUser | null>) & {
  /** Drop cached answers for this member (after an admin rename or delete). */
  forget?: (userId: string) => void;
};

export const HOME_COOKIE = 'wj_session';

export function readHomeToken(cookieHeader = ''): string | null {
  for (const part of cookieHeader.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === HOME_COOKIE) {
      const value = part.slice(at + 1).trim();
      return /^[a-f0-9]{64}$/.test(value) ? value : null;
    }
  }
  return null;
}

export class HomeAuthUnavailable extends Error {
  constructor() { super('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'); }
}

/** GET {url} with only the homepage cookie. Results are cached briefly so a page load does not hit the homepage many times. */
export function createHomeAuth({ url = process.env.HOME_AUTH_URL || 'http://127.0.0.1:8080/api/auth/me', cacheMs = 10_000, fetchImpl = fetch } = {}): VerifySession {
  const cache = new Map<string, { user: HomeUser | null; until: number }>();
  const verify: VerifySession = async cookieHeader => {
    const token = readHomeToken(cookieHeader);
    if (!token) return null;
    const now = Date.now();
    const hit = cache.get(token);
    if (hit && hit.until > now) return hit.user;
    let response: Response;
    try { response = await fetchImpl(url, { headers: { Cookie: `${HOME_COOKIE}=${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(3000) }); }
    catch { throw new HomeAuthUnavailable(); }
    let user: HomeUser | null = null;
    if (response.ok) {
      const data = await response.json().catch(() => null) as { user?: HomeUser } | null;
      const u = data?.user;
      if (u && typeof u.id === 'string' && typeof u.nickname === 'string') user = { id: u.id, name: String(u.name ?? ''), nickname: u.nickname };
    } else if (response.status !== 401) throw new HomeAuthUnavailable();
    cache.set(token, { user, until: now + cacheMs });
    if (cache.size > 5000) for (const [key, value] of cache) if (value.until <= now) cache.delete(key);
    return user;
  };
  verify.forget = userId => { for (const [key, value] of cache) if (value.user?.id === userId) cache.delete(key); };
  return verify;
}

/** Internal admin calls from the homepage server: shared secret, and never through the public tunnel. */
export function internalAllowed(headers: Record<string, string | string[] | undefined>, secret = process.env.INTERNAL_TOKEN ?? '') {
  if (!secret || headers['cf-connecting-ip'] || headers['x-forwarded-for']) return false;
  const given = headers['x-internal-token'];
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest(), b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
