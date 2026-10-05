export type Mode = '1v1' | '2v2';
export type Team = 0 | 1;
export type Gesture = 'rock' | 'paper' | 'scissors';
export type Phase = 'lobby' | 'rps' | 'playing' | 'finished';
export interface Player {
  id: string;
  nickname: string;
  seat: number | null;
  ready: boolean;
  connected: boolean;
}
export interface Move { x: number; y: number; color: 1 | 2; playerId: string }
export interface ChatMessage { id: string; nickname: string; text: string; system: boolean; time: number }
export interface RoomSummary { code: string; name: string; mode: Mode; phase: Phase; players: number; spectators: number }
export interface RoomState {
  code: string;
  name: string;
  mode: Mode;
  turnSeconds: number;
  gameId: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  board: number[][];
  moves: Move[];
  blackTeam: Team | null;
  currentSeat: number | null;
  deadline: number | null;
  rpsRound: number;
  rpsSelected: [boolean, boolean];
  result: { winner: Team | null; reason: string } | null;
  winningLine: [number, number][];
  chat: ChatMessage[];
  serverTime: number;
}
export type Reply = { ok: boolean; error?: string; code?: string };
export const teamOf = (seat: number): Team => (seat % 2) as Team;
export const seatsFor = (mode: Mode) => mode === '1v1' ? [0, 1] : [0, 1, 2, 3];
