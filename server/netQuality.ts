// How fast each player's connection really is. The browser pings every few seconds (and shows the number to the player)
// and reports how long each move took to be accepted. Slow moves and a per-connection summary go to the server log,
// together with the Cloudflare city the player came through (a phone routed through LAX is the usual cause of lag).

export const SLOW_MOVE_MS = 1500;
const KEEP = 500;

const ms = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 60_000 ? Math.round(value) : null;

/** Cloudflare city code from the CF-Ray header ("8f1c2a3b4c5d6e7f-LAX" → "LAX"), or "?" outside Cloudflare. */
export function edgeOf(cfRay: unknown): string {
  const match = typeof cfRay === 'string' ? /-([A-Z]{3})$/.exec(cfRay.trim()) : null;
  return match ? match[1] : '?';
}

export class NetQuality {
  private readonly pings: number[] = [];
  private readonly moves: number[] = [];
  constructor(readonly who: string, readonly edge: string, private readonly log: (line: string) => void = console.log) {}

  /** `{ ping?: number, moves?: number[] }` from the browser. Anything else is ignored. */
  report(data: unknown) {
    const { ping, moves } = (data && typeof data === 'object' ? data : {}) as { ping?: unknown; moves?: unknown };
    const p = ms(ping);
    if (p !== null) this.keep(this.pings, p);
    if (!Array.isArray(moves)) return;
    for (const value of moves.slice(0, 10)) {
      const m = ms(value);
      if (m === null) continue;
      this.keep(this.moves, m);
      if (m >= SLOW_MOVE_MS) this.log(`오목 느린 착수 ${m}ms · ${this.who} · 경유 ${this.edge}`);
    }
  }

  private keep(list: number[], value: number) { list.push(value); if (list.length > KEEP) list.shift(); }

  /** One log line for the whole connection, or null when the browser never reported. */
  summary(): string | null {
    if (!this.pings.length && !this.moves.length) return null;
    const describe = (list: number[]) => {
      if (!list.length) return '없음';
      const sorted = [...list].sort((a, b) => a - b);
      const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
      return `중앙 ${at(0.5)} · 90% ${at(0.9)} · 최대 ${sorted.at(-1)}ms (${sorted.length}번)`;
    };
    return `오목 접속 품질 · ${this.who} · 경유 ${this.edge} · 핑 ${describe(this.pings)} · 착수 응답 ${describe(this.moves)}`;
  }
}
