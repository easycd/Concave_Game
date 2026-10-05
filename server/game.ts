import { randomUUID } from 'node:crypto';
import { type ChatMessage, type Gesture, type Mode, type Player, type RoomState, type Team, seatsFor, teamOf } from '../src/shared.js';

export class GameRoom {
  state: Omit<RoomState, 'serverTime' | 'rpsSelected'>;
  choices: [Gesture | null, Gesture | null] = [null, null];
  constructor(code: string, name: string, mode: Mode, hostId: string, private now = () => Date.now(), turnSeconds = 30) {
    if (!Number.isInteger(turnSeconds) || turnSeconds < 5 || turnSeconds > 300) throw new Error('제한 시간은 5~300초 사이의 정수로 설정해주세요.');
    this.state = { code, name, mode, turnSeconds, hostId, phase: 'lobby', players: [], board: this.emptyBoard(), moves: [], blackTeam: null, currentSeat: null, deadline: null, rpsRound: 0, result: null, winningLine: [], chat: [] };
  }
  emptyBoard() { return Array.from({ length: 15 }, () => Array<number>(15).fill(0)); }
  view(): RoomState { return { ...this.state, serverTime: this.now(), rpsSelected: [this.choices[0] !== null, this.choices[1] !== null] }; }
  player(id: string) { const p = this.state.players.find(p => p.id === id); if (!p) throw new Error('방에 참가한 뒤 이용해주세요.'); return p; }
  message(text: string, nickname = '안내', system = true) {
    const msg: ChatMessage = { id: randomUUID(), nickname, text, system, time: this.now() };
    this.state.chat.push(msg);
    this.state.chat = this.state.chat.slice(-100);
  }
  add(id: string, nickname: string, spectator = false) {
    if (this.state.players.some(p => p.id === id)) return;
    const seat = !spectator && this.state.phase === 'lobby' ? seatsFor(this.state.mode).find(s => !this.state.players.some(p => p.seat === s)) : undefined;
    if (seat === undefined && this.state.players.filter(p => p.seat === null).length >= 3) throw new Error('관전자 자리가 모두 찼습니다.');
    this.state.players.push({ id, nickname, seat: seat ?? null, ready: false, connected: true });
    this.message(`${nickname}님이 입장했습니다.`);
  }
  switchSeat(id: string, seat: number | null) {
    if (this.state.phase !== 'lobby') throw new Error('자리 이동은 대기 중에만 가능합니다.');
    const p = this.player(id);
    if (seat !== null && (!Number.isInteger(seat) || !seatsFor(this.state.mode).includes(seat))) throw new Error('올바른 자리를 선택해주세요.');
    if (seat === p.seat) return;
    if (seat !== null && this.state.players.some(p => p.seat === seat)) throw new Error('이미 선택된 자리입니다.');
    if (seat === null && this.state.players.filter(p => p.seat === null).length >= 3) throw new Error('관전자는 최대 3명입니다.');
    p.seat = seat;
    this.state.players.forEach(p => p.ready = false);
  }
  ready(id: string) {
    if (this.state.phase !== 'lobby') throw new Error('지금은 준비 상태를 바꿀 수 없습니다.');
    const p = this.player(id);
    if (p.seat === null) throw new Error('관전자는 준비할 수 없습니다.');
    p.ready = !p.ready;
  }
  start(id: string) {
    if (id !== this.state.hostId) throw new Error('방장만 시작할 수 있습니다.');
    if (this.state.phase !== 'lobby') throw new Error('이미 게임이 진행 중입니다.');
    if (!seatsFor(this.state.mode).every(s => this.state.players.some(p => p.seat === s && p.ready && p.connected))) throw new Error('모든 플레이어가 자리에 앉아 준비해야 합니다.');
    this.state.board = this.emptyBoard(); this.state.moves = []; this.state.result = null; this.state.winningLine = [];
    this.state.blackTeam = null; this.state.currentSeat = null; this.state.rpsRound = 0;
    this.newRound();
  }
  newRound() {
    this.state.phase = 'rps'; this.choices = [null, null]; this.state.rpsRound++;
    this.state.deadline = this.now() + 3000;
    this.message(`가위바위보 ${this.state.rpsRound}라운드! 각 팀의 첫 번째 플레이어는 3초 안에 선택해주세요.`);
  }
  choose(id: string, gesture: Gesture) {
    this.tick();
    if (this.state.phase !== 'rps') throw new Error('가위바위보 선택 시간이 아닙니다.');
    const p = this.player(id);
    if (p.seat !== 0 && p.seat !== 1) throw new Error('각 팀의 첫 번째 플레이어만 선택할 수 있습니다.');
    if (!['rock', 'paper', 'scissors'].includes(gesture)) throw new Error('올바른 선택이 아닙니다.');
    if (this.choices[p.seat] !== null) throw new Error('이미 선택했습니다.');
    this.choices[p.seat] = gesture;
    if (this.choices.every(Boolean)) this.resolveRps();
  }
  resolveRps() {
    const [a, b] = this.choices;
    if (a === b) { this.message(a ? '무승부입니다. 다시 선택해주세요.' : '두 팀 모두 선택하지 않았습니다. 다시 시작합니다.'); this.newRound(); return; }
    const black: Team = !a ? 1 : !b ? 0 : (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock') ? 0 : 1;
    const labels = { rock: '바위', paper: '보', scissors: '가위' };
    this.message(`1팀 ${a ? labels[a] : '미선택'} / 2팀 ${b ? labels[b] : '미선택'} · ${black + 1}팀이 흑돌로 시작합니다.`);
    this.state.blackTeam = black; this.state.phase = 'playing'; this.state.currentSeat = black; this.state.deadline = this.now() + this.state.turnSeconds * 1000;
  }
  place(id: string, x: number, y: number) {
    this.tick();
    if (this.state.phase !== 'playing') throw new Error('진행 중인 대국이 없습니다.');
    const p = this.player(id);
    if (p.seat !== this.state.currentSeat || p.seat === null) throw new Error('내 차례가 아닙니다.');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 15 || y >= 15) throw new Error('바둑판 안에 돌을 놓아주세요.');
    if (this.state.board[y][x]) throw new Error('이미 돌이 놓인 자리입니다.');
    const color = teamOf(p.seat) === this.state.blackTeam ? 1 : 2;
    this.state.board[y][x] = color; this.state.moves.push({ x, y, color, playerId: id });
    const line = this.findLine(x, y, color);
    if (line.length >= 5) { this.state.winningLine = line; this.finish(teamOf(p.seat), '다섯 개의 돌을 연결했습니다.'); return; }
    if (this.state.moves.length === 225) { this.finish(null, '바둑판이 가득 찼습니다. 무승부입니다.'); return; }
    const order = this.state.mode === '1v1' ? [this.state.blackTeam!, 1 - this.state.blackTeam!] : this.state.blackTeam === 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
    this.state.currentSeat = order[(order.indexOf(p.seat) + 1) % order.length]; this.state.deadline = this.now() + this.state.turnSeconds * 1000;
  }
  findLine(x: number, y: number, color: number): [number, number][] {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line: [number, number][] = [[x, y]];
      for (const sign of [-1, 1]) {
        let nx = x + dx * sign, ny = y + dy * sign;
        while (nx >= 0 && ny >= 0 && nx < 15 && ny < 15 && this.state.board[ny][nx] === color) { line.push([nx, ny]); nx += dx * sign; ny += dy * sign; }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }
  finish(winner: Team | null, reason: string) {
    this.state.phase = 'finished'; this.state.result = { winner, reason }; this.state.deadline = null; this.state.currentSeat = null;
    this.message(`${winner === null ? '무승부' : `${winner + 1}팀 승리`} · ${reason}`);
  }
  tick() {
    if (this.state.deadline === null || this.now() < this.state.deadline) return false;
    if (this.state.phase === 'rps') this.resolveRps();
    else if (this.state.phase === 'playing') this.finish((1 - teamOf(this.state.currentSeat!)) as Team, `상대 팀의 ${this.state.turnSeconds}초 제한 시간이 초과되었습니다.`);
    return true;
  }
  resign(id: string) {
    this.tick();
    const p = this.player(id);
    if (p.seat === null || !['playing', 'rps'].includes(this.state.phase)) throw new Error('진행 중인 게임에서만 기권할 수 있습니다.');
    this.finish((1 - teamOf(p.seat)) as Team, `${p.nickname}님이 기권했습니다.`);
  }
  remove(id: string) {
    const p = this.player(id);
    if (p.seat !== null && ['rps', 'playing'].includes(this.state.phase)) this.finish((1 - teamOf(p.seat)) as Team, `${p.nickname}님이 퇴장했습니다.`);
    this.state.players = this.state.players.filter(p => p.id !== id);
    if (id === this.state.hostId) this.state.hostId = this.state.players.find(p => p.connected)?.id ?? this.state.players[0]?.id ?? '';
    if (this.state.phase === 'lobby') this.state.players.forEach(p => p.ready = false);
    this.message(`${p.nickname}님이 퇴장했습니다.`);
  }
  reset(id: string) {
    if (id !== this.state.hostId || this.state.phase !== 'finished') throw new Error('대국이 끝난 후 방장이 다시 시작할 수 있습니다.');
    this.state.phase = 'lobby'; this.state.players.forEach(p => p.ready = false);
    this.choices = [null, null]; this.state.blackTeam = null; this.state.board = this.emptyBoard(); this.state.moves = []; this.state.result = null; this.state.winningLine = [];
    this.message('새로운 대국을 준비합니다. 자리를 선택하고 준비해주세요.');
  }
}
