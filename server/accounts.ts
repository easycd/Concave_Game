import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Mode, Team } from '../src/shared.js';

export interface AccountStats {
  id: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  winRate: number;
}

export interface AccountStore {
  init(): Promise<void>;
  register(nickname: string, password: string): Promise<AccountStats>;
  login(nickname: string, password: string): Promise<AccountStats | null>;
  createSession(accountId: string): Promise<string>;
  authenticate(token: string): Promise<AccountStats | null>;
  logout(token: string): Promise<void>;
  stats(accountId: string): Promise<AccountStats | null>;
  leaderboard(): Promise<AccountStats[]>;
  recordGame(gameId: string, mode: Mode, winner: Team | null, players: { id: string; team: Team }[]): Promise<boolean>;
  close(): Promise<void>;
}

const toStats = (row: Record<string, unknown>): AccountStats => {
  const wins = Number(row.wins), losses = Number(row.losses), draws = Number(row.draws);
  const games = wins + losses + draws;
  return { id: String(row.id), nickname: String(row.nickname), wins, losses, draws, games, winRate: games ? Math.round(wins / games * 1000) / 10 : 0 };
};
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class MemoryAccountStore implements AccountStore {
  private users = new Map<string, AccountStats & { passwordHash: string }>();
  private sessions = new Map<string, string>();
  private games = new Set<string>();
  async init() {}
  async register(nickname: string, password: string) {
    if ([...this.users.values()].some(user => user.nickname.toLocaleLowerCase('ko-KR') === nickname.toLocaleLowerCase('ko-KR'))) throw new Error('중복된 닉네임입니다.');
    const account = { id: randomUUID(), nickname, passwordHash: await bcrypt.hash(password, 10), wins: 0, losses: 0, draws: 0, games: 0, winRate: 0 };
    this.users.set(account.id, account); return toStats(account as unknown as Record<string, unknown>);
  }
  async login(nickname: string, password: string) {
    const account = [...this.users.values()].find(user => user.nickname.toLocaleLowerCase('ko-KR') === nickname.toLocaleLowerCase('ko-KR'));
    return account && await bcrypt.compare(password, account.passwordHash) ? toStats(account as unknown as Record<string, unknown>) : null;
  }
  async createSession(accountId: string) { const token = randomBytes(32).toString('hex'); this.sessions.set(tokenHash(token), accountId); return token; }
  async authenticate(token: string) { const id = this.sessions.get(tokenHash(token)); return id ? this.stats(id) : null; }
  async logout(token: string) { this.sessions.delete(tokenHash(token)); }
  async stats(accountId: string) { const account = this.users.get(accountId); return account ? toStats(account as unknown as Record<string, unknown>) : null; }
  async leaderboard() { return [...this.users.values()].map(account => toStats(account as unknown as Record<string, unknown>)).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.nickname.localeCompare(b.nickname, 'ko')).slice(0, 10); }
  async recordGame(gameId: string, _mode: Mode, winner: Team | null, players: { id: string; team: Team }[]) {
    if (this.games.has(gameId)) return false; this.games.add(gameId);
    for (const player of new Map(players.map(player => [player.id, player])).values()) {
      const account = this.users.get(player.id); if (!account) continue;
      if (winner === null) account.draws++; else if (player.team === winner) account.wins++; else account.losses++;
    }
    return true;
  }
  async close() {}
}

export class PostgresAccountStore implements AccountStore {
  private pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 }); }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY,
        nickname VARCHAR(12) NOT NULL,
        password_hash TEXT NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
        losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
        draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_nickname_lower_unique ON accounts (LOWER(nickname));
      CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ranked_games (
        game_id UUID PRIMARY KEY,
        mode VARCHAR(3) NOT NULL,
        winner SMALLINT,
        finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ranked_game_results (
        game_id UUID NOT NULL REFERENCES ranked_games(game_id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        outcome VARCHAR(4) NOT NULL,
        PRIMARY KEY (game_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions (expires_at);
    `);
  }
  async register(nickname: string, password: string) {
    try {
      const result = await this.pool.query('INSERT INTO accounts (id, nickname, password_hash) VALUES ($1, $2, $3) RETURNING *', [randomUUID(), nickname, await bcrypt.hash(password, 10)]);
      return toStats(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new Error('중복된 닉네임입니다.');
      throw error;
    }
  }
  async login(nickname: string, password: string) {
    const result = await this.pool.query('SELECT * FROM accounts WHERE LOWER(nickname) = LOWER($1)', [nickname]);
    return result.rows[0] && await bcrypt.compare(password, result.rows[0].password_hash) ? toStats(result.rows[0]) : null;
  }
  async createSession(accountId: string) {
    const token = randomBytes(32).toString('hex');
    await this.pool.query("INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [tokenHash(token), accountId]);
    return token;
  }
  async authenticate(token: string) {
    const result = await this.pool.query(`SELECT a.* FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [tokenHash(token)]);
    return result.rows[0] ? toStats(result.rows[0]) : null;
  }
  async logout(token: string) { await this.pool.query('DELETE FROM account_sessions WHERE token_hash = $1', [tokenHash(token)]); }
  async stats(accountId: string) { const result = await this.pool.query('SELECT * FROM accounts WHERE id = $1', [accountId]); return result.rows[0] ? toStats(result.rows[0]) : null; }
  async leaderboard() { const result = await this.pool.query('SELECT * FROM accounts ORDER BY wins DESC, losses ASC, LOWER(nickname) ASC LIMIT 10'); return result.rows.map(toStats); }
  async recordGame(gameId: string, mode: Mode, winner: Team | null, players: { id: string; team: Team }[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query('INSERT INTO ranked_games (game_id, mode, winner) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING game_id', [gameId, mode, winner]);
      if (!inserted.rowCount) { await client.query('ROLLBACK'); return false; }
      for (const player of new Map(players.map(player => [player.id, player])).values()) {
        const outcome = winner === null ? 'draw' : player.team === winner ? 'win' : 'loss';
        const result = await client.query('INSERT INTO ranked_game_results (game_id, account_id, outcome) SELECT $1, id, $2 FROM accounts WHERE id = $3 ON CONFLICT DO NOTHING RETURNING account_id', [gameId, outcome, player.id]);
        if (result.rowCount) await client.query(`UPDATE accounts SET wins = wins + $2, losses = losses + $3, draws = draws + $4 WHERE id = $1`, [player.id, outcome === 'win' ? 1 : 0, outcome === 'loss' ? 1 : 0, outcome === 'draw' ? 1 : 0]);
      }
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}

export const createAccountStore = (): AccountStore => process.env.DATABASE_URL ? new PostgresAccountStore(process.env.DATABASE_URL) : new MemoryAccountStore();
