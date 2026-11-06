// Omok records (wins / losses / draws) per homepage member. Login itself is on the homepage (see homeAuth.ts).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
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

interface Profile { id: string; nickname: string; wins: number; losses: number; draws: number; createdAt: number }

export interface AccountStore {
  init(): Promise<void>;
  /** Create the record on first visit; keep the nickname in step with the homepage. */
  ensure(user: { id: string; nickname: string }): Promise<AccountStats>;
  stats(accountId: string): Promise<AccountStats | null>;
  leaderboard(): Promise<AccountStats[]>;
  recordGame(gameId: string, mode: Mode, winner: Team | null, players: { id: string; team: Team }[]): Promise<boolean>;
  rename(accountId: string, nickname: string): Promise<boolean>;
  remove(accountId: string): Promise<boolean>;
  close(): Promise<void>;
}

const toStats = (p: Profile): AccountStats => {
  const games = p.wins + p.losses + p.draws;
  return { id: p.id, nickname: p.nickname, wins: p.wins, losses: p.losses, draws: p.draws, games, winRate: games ? Math.round(p.wins / games * 1000) / 10 : 0 };
};

export class MemoryAccountStore implements AccountStore {
  protected profiles = new Map<string, Profile>();
  protected games = new Set<string>();
  protected changed(): Promise<void> { return Promise.resolve(); }
  async init() {}
  async ensure(user: { id: string; nickname: string }) {
    let profile = this.profiles.get(user.id);
    if (!profile) { profile = { id: user.id, nickname: user.nickname, wins: 0, losses: 0, draws: 0, createdAt: Date.now() }; this.profiles.set(user.id, profile); await this.changed(); }
    else if (profile.nickname !== user.nickname) { profile.nickname = user.nickname; await this.changed(); }
    return toStats(profile);
  }
  async stats(accountId: string) { const p = this.profiles.get(accountId); return p ? toStats(p) : null; }
  async leaderboard() {
    return [...this.profiles.values()].filter(p => p.wins + p.losses + p.draws > 0).map(toStats)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.nickname.localeCompare(b.nickname, 'ko')).slice(0, 10);
  }
  async recordGame(gameId: string, _mode: Mode, winner: Team | null, players: { id: string; team: Team }[]) {
    if (this.games.has(gameId)) return false;
    this.games.add(gameId);
    for (const player of new Map(players.map(p => [p.id, p])).values()) {
      const profile = this.profiles.get(player.id); if (!profile) continue;
      if (winner === null) profile.draws++; else if (player.team === winner) profile.wins++; else profile.losses++;
    }
    await this.changed();
    return true;
  }
  async rename(accountId: string, nickname: string) {
    const p = this.profiles.get(accountId); if (!p) return false;
    p.nickname = nickname; await this.changed(); return true;
  }
  async remove(accountId: string) {
    const existed = this.profiles.delete(accountId);
    if (existed) await this.changed();
    return existed;
  }
  async close() {}
}

/** Same as memory, but every change is written atomically to one JSON file. */
export class FileAccountStore extends MemoryAccountStore {
  private queue: Promise<void> = Promise.resolve();
  constructor(private file: string) { super(); }
  async init() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as { profiles?: Profile[]; games?: string[] };
      for (const p of saved.profiles ?? []) if (p && typeof p.id === 'string') this.profiles.set(p.id, { id: p.id, nickname: String(p.nickname), wins: Number(p.wins) || 0, losses: Number(p.losses) || 0, draws: Number(p.draws) || 0, createdAt: Number(p.createdAt) || Date.now() });
      for (const id of saved.games ?? []) this.games.add(id);
    } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
  }
  protected changed() {
    const job = this.queue.then(async () => {
      const data = { profiles: [...this.profiles.values()], games: [...this.games].slice(-5000) };
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
      await rename(tmp, this.file);
    });
    this.queue = job.catch(error => console.error('전적 파일 저장 실패:', error instanceof Error ? error.message : error));
    return job;
  }
  async close() { await this.queue; }
}

export const createAccountStore = (): AccountStore =>
  process.env.OMOK_DATA_DIR ? new FileAccountStore(path.resolve(process.env.OMOK_DATA_DIR, 'records.json')) : new MemoryAccountStore();
