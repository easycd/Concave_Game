import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './game.js';
import { type Mode, type Team } from '../src/shared.js';

function setup(mode: Mode = '1v1', black: Team = 0, turnSeconds = 30) {
  let time = 1000;
  const room = new GameRoom('ABC123', '테스트', mode, 'p0', () => time, turnSeconds);
  for (let seat = 0; seat < (mode === '1v1' ? 2 : 4); seat++) { room.add(`p${seat}`, `참가자${seat}`); room.ready(`p${seat}`); }
  room.start('p0');
  room.choose('p0', black === 0 ? 'rock' : 'scissors'); room.choose('p1', black === 0 ? 'scissors' : 'rock');
  return { room, advance: (ms: number) => { time += ms; room.tick(); } };
}

test('custom turn duration applies to first and subsequent turns in both modes', () => {
  for (const mode of ['1v1', '2v2'] as Mode[]) {
    const { room, advance } = setup(mode, 0, 10);
    advance(9000); assert.equal(room.state.phase, 'playing');
    room.place('p0', 7, 7);
    advance(9999); assert.equal(room.state.phase, 'playing');
    advance(1); assert.equal(room.state.result?.winner, 0);
    assert.match(room.state.result!.reason, /10초/);
  }
  for (const duration of [0, 301, 10.5, NaN]) assert.throws(() => setup('1v1', 0, duration));
});

test('1v1 enforces turns, occupied intersections, boundaries and 30s timeout', () => {
  const { room, advance } = setup();
  assert.equal(room.state.currentSeat, 0);
  assert.throws(() => room.place('p1', 0, 0));
  assert.throws(() => room.place('p0', 15, 0));
  room.place('p0', 7, 7);
  assert.equal(room.state.currentSeat, 1);
  assert.throws(() => room.place('p1', 7, 7));
  advance(29999); assert.equal(room.state.phase, 'playing');
  advance(1); assert.equal(room.state.result?.winner, 0);
  assert.equal(room.state.phase, 'finished');
  assert.throws(() => room.place('p1', 8, 8));
});
test('2v2 alternates teams and teammates for either black team', () => {
  for (const black of [0, 1] as Team[]) {
    const { room } = setup('2v2', black);
    const order = black === 0 ? [0, 1, 2, 3, 0, 1, 2, 3] : [1, 0, 3, 2, 1, 0, 3, 2];
    order.forEach((seat, x) => { assert.equal(room.state.currentSeat, seat); room.place(`p${seat}`, x, 0); assert.equal(room.state.board[0][x], x % 2 === 0 ? 1 : 2); });
  }
});
test('five stones win horizontally, vertically and in both diagonals', () => {
  for (const [dx, dy, ox, oy] of [[1, 0, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0], [1, -1, 0, 4]]) {
    const { room } = setup();
    for (let i = 0; i < 5; i++) { room.place('p0', ox + i * dx, oy + i * dy); if (i < 4) room.place('p1', 10 + i, 14); }
    assert.equal(room.state.result?.winner, 0); assert.equal(room.state.winningLine.length, 5);
  }
});
test('long lines win and teammate stones contribute to a shared win', () => {
  const { room } = setup('2v2');
  for (const x of [0, 1, 2, 4, 5, 3]) {
    const seat = room.state.currentSeat!;
    room.place(`p${seat}`, x, 0);
    if (room.state.phase === 'playing') room.place(`p${room.state.currentSeat}`, room.state.moves.length, 14);
  }
  assert.equal(room.state.result?.winner, 0); assert.equal(room.state.winningLine.length, 6);
});
test('lobby supports seat changes, readiness reset and three spectators', () => {
  const room = new GameRoom('ABC123', '방', '2v2', 'p0');
  for (let i = 0; i < 7; i++) room.add(`p${i}`, `사람${i}`);
  assert.equal(room.state.players.filter(p => p.seat === null).length, 3);
  assert.throws(() => room.add('p7', '네번째 관전자', true));
  assert.throws(() => room.switchSeat('p4', 0));
  assert.throws(() => room.ready('p4'));
  assert.throws(() => room.start('p1'));
  assert.throws(() => room.start('p0'));
  room.ready('p0'); room.remove('p1'); room.switchSeat('p4', 1);
  assert.equal(room.player('p0').ready, false); assert.equal(room.player('p4').seat, 1);
});
test('RPS hides selections, repeats ties, enforces captain and handles omissions', () => {
  let time = 0;
  const room = new GameRoom('ABC123', '방', '2v2', 'p0', () => time);
  for (let i = 0; i < 4; i++) { room.add(`p${i}`, `사람${i}`); room.ready(`p${i}`); }
  room.start('p0');
  assert.throws(() => room.choose('p2', 'rock'));
  room.choose('p0', 'paper'); assert.deepEqual(room.view().rpsSelected, [true, false]); assert.ok(!('choices' in room.view()));
  assert.throws(() => room.choose('p0', 'rock'));
  room.choose('p1', 'paper'); assert.equal(room.state.rpsRound, 2);
  time = 3000; room.tick(); assert.equal(room.state.rpsRound, 3);
  room.choose('p1', 'scissors'); time = 6000; room.tick();
  assert.equal(room.state.blackTeam, 1); assert.equal(room.state.phase, 'playing');
  assert.throws(() => room.switchSeat('p2', null));
});
test('late moves cannot evade timeout and resignation/leave award the other team', () => {
  const { room, advance } = setup('2v2'); advance(30000); assert.throws(() => room.place('p0', 7, 7)); assert.equal(room.state.result?.winner, 1);
  const a = setup('2v2').room; a.resign('p2'); assert.equal(a.state.result?.winner, 1);
  const b = setup().room; b.remove('p0'); assert.equal(b.state.result?.winner, 1); assert.equal(b.state.hostId, 'p1');
  b.reset('p1'); assert.equal(b.state.phase, 'lobby'); assert.equal(b.state.moves.length, 0);
});
