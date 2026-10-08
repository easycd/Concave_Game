import { renjuForbidden, renjuForbiddenMoves, type ForbiddenMove } from '../src/renju.js';
import { randomUUID } from 'node:crypto';
import { type ChatMessage, type Gesture, type Mode, type Player, type RoomState, type Team, seatsFor, teamOf } from '../src/shared.js';

export class GameRoom {
  state: Omit<RoomState, 'serverTime' | 'rpsSelected' | 'forbiddenMoves'>;
  choices: [Gesture | null, Gesture | null] = [null, null];
  constructor(code: string, name: string, mode: Mode, hostId: string, private now = () => Date.now(), turnSeconds = 30, rules: RoomState['rules'] = 'freestyle', private onFinish?: (room: GameRoom) => void) {
    if (!['freestyle', 'renju'].includes(rules)) throw new Error('올바른 오목 규칙을 선택해주세요.');
    if (!Number.isInteger(turnSeconds) || turnSeconds < 2 || turnSeconds > 300) throw new Error('제한 시간은 2~300초 사이의 정수로 설정해주세요.');
    this.state = { code, name, mode, rules, turnSeconds, gameId: '', startedAt: null, finishedAt: null, drawOffer: null, rematchOffer: null, hostId, phase: 'lobby', players: [], board: this.emptyBoard(), moves: [], blackTeam: null, currentSeat: null, deadline: null, rpsRound: 0, rpsRetryReason: null, rpsResult: null, winningLine: [], result: null, chat: [] };
  }
  emptyBoard() { return Array.from({ length: 15 }, () => Array<number>(15).fill(0)); }
  private forbiddenCache = { board: '', moves: [] as ForbiddenMove[] };
  view(): RoomState {
    let forbiddenMoves: ForbiddenMove[] = [];
    if (this.state.rules === 'renju' && this.state.phase === 'playing' && teamOf(this.state.currentSeat!) === this.state.blackTeam) {
      const board = this.state.board.flat().join('');
      if (board !== this.forbiddenCache.board) this.forbiddenCache = { board, moves: renjuForbiddenMoves(this.state.board) };
      forbiddenMoves = this.forbiddenCache.moves;
    }
    return { ...this.state, forbiddenMoves, serverTime: this.now(), rpsSelected: [this.choices[0] !== null, this.choices[1] !== null] }; }
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
    if (!['lobby', 'finished'].includes(this.state.phase)) throw new Error('자리 이동은 대기 중이거나 대국 종료 후에 가능합니다.');
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
    this.state.currentSeat = null; this.state.rpsRound = 0;
    this.choices = [null, null]; this.state.rpsResult = null; this.state.rpsRetryReason = null;
    this.state.gameId = randomUUID();
    this.state.startedAt = null; this.state.finishedAt = null; this.state.drawOffer = null; this.state.rematchOffer = null;
    if (this.state.blackTeam === null) this.newRound();
    else {
      this.message(`흑백을 바꿔 새 대국을 시작합니다. ${this.state.blackTeam + 1}팀이 흑돌로 선공합니다. 가위바위보는 생략합니다.`);
      this.beginPlay(this.state.blackTeam);
    }
  }
  private beginPlay(black: Team) {
    this.state.startedAt = this.now();
    this.state.blackTeam = black; this.state.phase = 'playing'; this.state.currentSeat = black;
    this.state.deadline = this.now() + this.state.turnSeconds * 1000;
  }
  newRound(reason: RoomState['rpsRetryReason'] = null) {
    this.state.rpsRetryReason = reason;
    this.state.phase = 'rps'; this.choices = [null, null]; this.state.rpsResult = null; this.state.rpsRound++;
    this.state.deadline = this.now() + 10000;
    this.message(`가위바위보 ${this.state.rpsRound}라운드! 각 팀의 첫 번째 플레이어는 10초 안에 선택해주세요.`);
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
    if (a === b) { this.message(a ? '무승부입니다. 다시 선택해주세요.' : '두 팀 모두 선택하지 않았습니다. 다시 시작합니다.'); this.newRound(a ? 'tie' : 'missing'); return; }
    const black: Team = !a ? 1 : !b ? 0 : (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock') ? 0 : 1;
    const labels = { rock: '바위', paper: '보', scissors: '가위' };
    this.message(`1팀 ${a ? labels[a] : '미선택'} / 2팀 ${b ? labels[b] : '미선택'} · ${black + 1}팀이 흑돌로 시작합니다.`);
    this.state.rpsRetryReason = null;
    this.state.rpsResult = { winner: black, choices: [a, b] };
    this.beginPlay(black);
  }
  place(id: string, x: number, y: number) {
    this.tick();
    if (this.state.phase !== 'playing') throw new Error('진행 중인 대국이 없습니다.');
    const p = this.player(id);
    if (p.seat !== this.state.currentSeat || p.seat === null) throw new Error('내 차례가 아닙니다.');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 15 || y >= 15) throw new Error('바둑판 안에 돌을 놓아주세요.');
    if (this.state.board[y][x]) throw new Error('이미 돌이 놓인 자리입니다.');
    const color = teamOf(p.seat) === this.state.blackTeam ? 1 : 2;
    if (color === 1 && this.state.rules === 'renju') {
      const forbidden = renjuForbidden(this.state.board, x, y);
      if (forbidden) throw new Error(`렌주 금수(${forbidden}) 자리에는 흑돌을 놓을 수 없습니다.`);
    }
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
      if (line.length >= 5 && (this.state.rules !== 'renju' || color === 2 || line.length === 5)) return line;
    }
    return [];
  }
  finish(winner: Team | null, reason: string) {
    this.state.finishedAt = this.now(); this.state.drawOffer = null;
    this.state.phase = 'finished'; this.state.result = { winner, reason }; this.state.deadline = null; this.state.currentSeat = null;
    this.message(`${winner === null ? '무승부' : `${winner + 1}팀 승리`} · ${reason}`);
    this.onFinish?.(this);
  }
  tick() {
    let changed = false;
    if (this.state.drawOffer && this.now() >= this.state.drawOffer.expiresAt) {
      this.state.drawOffer = null; this.message('무승부 신청이 10초 동안 수락되지 않아 취소되었습니다.'); changed = true;
    }
    if (this.state.deadline === null || this.now() < this.state.deadline) return changed;
    if (this.state.phase === 'rps') this.resolveRps();
    else if (this.state.phase === 'playing') this.finish((1 - teamOf(this.state.currentSeat!)) as Team, `상대 팀의 ${this.state.turnSeconds}초 제한 시간이 초과되었습니다.`);
    return true;
  }
  offerDraw(id: string) {
    this.tick(); const p = this.player(id);
    if (this.state.phase !== 'playing' || p.seat === null) throw new Error('대국 중인 플레이어만 무승부를 신청할 수 있습니다.');
    if (this.state.drawOffer) throw new Error('이미 무승부 신청이 진행 중입니다.');
    this.state.drawOffer = { team: teamOf(p.seat), nickname: p.nickname, expiresAt: this.now() + 10000 };
    this.message(`${p.nickname}님이 무승부를 신청했습니다. 상대 팀은 10초 안에 수락해주세요. 착수 시간은 계속 흐릅니다.`);
  }
  answerDraw(id: string, accept: boolean) {
    this.tick(); const p = this.player(id); const offer = this.state.drawOffer;
    if (this.state.phase !== 'playing' || !offer) throw new Error('유효한 무승부 신청이 없습니다.');
    if (p.seat === null || teamOf(p.seat) === offer.team) throw new Error('상대 팀 플레이어만 응답할 수 있습니다.');
    if (typeof accept !== 'boolean') throw new Error('수락 여부를 선택해주세요.');
    if (accept) this.finish(null, `${offer.nickname}님의 무승부 신청을 ${p.nickname}님이 수락했습니다.`);
    else { this.state.drawOffer = null; this.message(`${p.nickname}님이 무승부 신청을 거절했습니다.`); }
  }
  requestRematch(id: string) {
    const p = this.player(id);
    if (this.state.phase !== 'finished' || p.seat === null) throw new Error('대국을 마친 플레이어만 한 판 더 신청할 수 있습니다.');
    const team = teamOf(p.seat);
    if (!this.state.rematchOffer) {
      this.state.rematchOffer = { team, nickname: p.nickname };
      this.message(`${p.nickname}님이 한 판 더 신청했습니다. 상대 팀이 수락하면 준비 화면으로 이동합니다.`);
      return;
    }
    if (this.state.rematchOffer.team === team) throw new Error('상대 팀의 수락을 기다리고 있습니다.');
    this.message(`${p.nickname}님이 한 판 더 신청을 수락했습니다.`);
    this.reset(this.state.hostId);
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
    this.choices = [null, null]; this.state.rpsRetryReason = null; this.state.rpsResult = null;
    if (this.state.blackTeam !== null) this.state.blackTeam = (1 - this.state.blackTeam) as Team;
    this.state.currentSeat = null; this.state.deadline = null;
    this.state.startedAt = null; this.state.finishedAt = null; this.state.drawOffer = null; this.state.rematchOffer = null;
    this.state.board = this.emptyBoard(); this.state.moves = []; this.state.result = null; this.state.winningLine = [];
    this.message(this.state.blackTeam === null ? '새로운 대국을 준비합니다. 자리를 선택하고 준비해주세요.' : `다음 대국은 ${this.state.blackTeam + 1}팀 흑돌, ${2 - this.state.blackTeam}팀 백돌입니다. 모두 준비하면 가위바위보 없이 시작합니다.`);
  }
}
