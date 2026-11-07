// Tells the homepage when a match ends, for the admin page's 플레이 기록 (wodnjs.com_Web README "로그").
// Local call with the shared secret; a failure only costs that one log line, never the game.

export interface PlayReport {
  game: 'omok'; gameId: string; room: string | null; mode: string | null;
  startedAt: number; endedAt: number; result: string | null; reason: string | null; moves: number | null;
  players: { id: string; nickname: string; team: string | null; result: 'win' | 'loss' | 'draw' | null }[];
}
export type ReportPlay = (play: PlayReport) => Promise<void>;

const defaultUrl = () => {
  if (process.env.HOME_PLAYS_URL) return process.env.HOME_PLAYS_URL;
  const auth = process.env.HOME_AUTH_URL || 'http://127.0.0.1:8080/api/auth/me';
  return auth.replace(/\/api\/auth\/me$/, '/api/internal/plays');
};

export function createPlayReporter({ url = defaultUrl(), token = process.env.INTERNAL_TOKEN ?? '', fetchImpl = fetch } = {}): ReportPlay {
  if (!token) return async () => {};
  return async play => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token }, body: JSON.stringify(play), signal: AbortSignal.timeout(3000) });
        if (res.ok || res.status < 500) return;              // 4xx: retrying would not help
      } catch { /* homepage restarting: try once more */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.error('플레이 기록 전송 실패:', play.gameId);
  };
}
