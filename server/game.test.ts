import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './game.js';
import { type Mode, type Team } from '../src/shared.js';

test('draw offers require an opponent, expire after ten seconds and do not pause turns', () => {
  for (const mode of ['1v1', '2v2'] as Mode[]) {
    const { room, advance } = setup(mode, 0, 60);
    room.add('watch', '관전자', true);
    const deadline = room.state.deadline;
    assert.throws(() => room.offerDraw('watch'));
    room.offerDraw('p0');
    assert.equal(room.state.deadline, deadline);
    assert.throws(() => room.offerDraw('p1'));
    assert.throws(() => room.answerDraw('p0', true));
    assert.throws(() => room.answerDraw('watch', true));
    advance(9999); room.answerDraw(mode === '2v2' ? 'p3' : 'p1', true);
    assert.equal(room.state.phase, 'finished'); assert.equal(room.state.result?.winner, null);
    assert.equal(room.state.drawOffer, null); assert.equal(room.state.finishedAt, 10999);
    room.requestRematch('p1'); assert.equal(room.state.phase, 'finished');
    assert.deepEqual(room.state.rematchOffer, { team: 1, nickname: '참가자1' });
    room.requestRematch('p0'); assert.equal(room.state.phase, 'lobby');
    assert.equal(room.state.startedAt, null); assert.equal(room.state.finishedAt, null);
  }
  const { room, advance } = setup('1v1', 0, 60);
  room.offerDraw('p0'); advance(10000);
  assert.equal(room.state.phase, 'playing'); assert.equal(room.state.drawOffer, null);
  assert.throws(() => room.answerDraw('p1', true));
  room.offerDraw('p1'); room.answerDraw('p0', false); assert.equal(room.state.drawOffer, null);
  const short = setup('1v1', 0, 2); short.room.offerDraw('p0'); short.advance(2000);
  assert.equal(short.room.state.result?.winner, 1); assert.equal(short.room.state.drawOffer, null);
});

test('spectators can join vacant seats after a match and rematches require the other team to accept', () => {
  const { room } = setup(); room.add('watch', '관전자', true);
  assert.throws(() => room.switchSeat('watch', 1));
  room.resign('p1'); room.switchSeat('p1', null); room.switchSeat('watch', 1);
  assert.equal(room.player('watch').seat, 1);
  assert.throws(() => room.requestRematch('p1'));
  room.requestRematch('watch'); assert.equal(room.state.phase, 'finished');
  room.requestRematch('p0'); assert.equal(room.state.phase, 'lobby');
  assert.equal(room.state.blackTeam, 1);
  assert.throws(() => room.requestRematch('watch'));
});

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
    const { room, advance } = setup(mode, 0, 2);
    advance(1999); assert.equal(room.state.phase, 'playing');
    room.place('p0', 7, 7);
    advance(1999); assert.equal(room.state.phase, 'playing');
    advance(1); assert.equal(room.state.result?.winner, 0);
    assert.match(room.state.result!.reason, /2초/);
  }
  for (const duration of [0, 1, 301, 2.5, NaN]) assert.throws(() => setup('1v1', 0, duration));
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
  assert.equal(room.view().rpsResult, null);
  assert.throws(() => room.choose('p0', 'rock'));
  room.choose('p1', 'paper'); assert.equal(room.state.rpsRound, 2);
  assert.equal(room.view().rpsRetryReason, 'tie');
  assert.deepEqual(room.view().rpsSelected, [false, false]);
  assert.equal(room.state.deadline, 10000);
  time = 10000; room.tick(); assert.equal(room.state.rpsRound, 3);
  assert.equal(room.view().rpsRetryReason, 'missing');
  room.choose('p1', 'scissors'); time = 20000; room.tick();
  assert.equal(room.state.blackTeam, 1); assert.equal(room.state.phase, 'playing');
  assert.equal(room.view().rpsRetryReason, null);
  assert.throws(() => room.switchSeat('p2', null));
});
test('late moves cannot evade timeout and resignation/leave award the other team', () => {
  const { room, advance } = setup('2v2'); advance(30000); assert.throws(() => room.place('p0', 7, 7)); assert.equal(room.state.result?.winner, 1);
  const a = setup('2v2').room; a.resign('p2'); assert.equal(a.state.result?.winner, 1);
  const b = setup().room; b.remove('p0'); assert.equal(b.state.result?.winner, 1); assert.equal(b.state.hostId, 'p1');
  b.reset('p1'); assert.equal(b.state.phase, 'lobby'); assert.equal(b.state.moves.length, 0);
});

test('RPS allows ten seconds and resolves immediately when both captains choose', () => {
  let time = 0;
  const room = new GameRoom('ABC123', '방', '1v1', 'p0', () => time);
  for (let i = 0; i < 2; i++) { room.add(`p${i}`, `사람${i}`); room.ready(`p${i}`); }
  room.start('p0'); const firstGame = room.state.gameId;
  assert.equal(room.state.deadline, 10000);
  time = 9000; room.tick(); assert.equal(room.state.rpsRound, 1);
  room.choose('p0', 'rock'); room.choose('p1', 'scissors');
  assert.equal(room.state.phase, 'playing'); assert.equal(room.state.blackTeam, 0);
  assert.deepEqual(room.view().rpsResult, { winner: 0, choices: ['rock', 'scissors'] });
  room.resign('p1'); room.reset('p0');
  assert.equal(room.state.rpsResult, null);
  room.ready('p0'); room.ready('p1'); room.start('p0');
  assert.notEqual(room.state.gameId, firstGame);
});

test('rematches swap colors without RPS and alternate every round in both modes', () => {
  for (const mode of ['1v1', '2v2'] as Mode[]) for (const initialBlack of [0, 1] as Team[]) {
    const { room } = setup(mode, initialBlack, 60);
    let previousGame = room.state.gameId;
    for (let match = 1; match <= 3; match++) {
      room.resign('p0'); room.reset('p0');
      const black = (match % 2 ? 1 - initialBlack : initialBlack) as Team;
      assert.equal(room.state.blackTeam, black);
      assert.equal(room.state.phase, 'lobby'); assert.equal(room.state.deadline, null);
      assert.throws(() => room.start('p0'), /준비/);
      for (const p of room.state.players) room.ready(p.id);
      room.start('p0');
      assert.notEqual(room.state.gameId, previousGame); previousGame = room.state.gameId;
      assert.equal(room.state.phase, 'playing'); assert.equal(room.state.rpsRound, 0);
      assert.equal(room.state.rpsResult, null); assert.deepEqual(room.view().rpsSelected, [false, false]);
      assert.equal(room.state.currentSeat, black); assert.equal(room.state.deadline, 61000);
      assert.equal(room.state.moves.length, 0); assert.ok(room.state.board.flat().every(v => v === 0));
      assert.throws(() => room.choose('p0', 'rock'), /선택 시간/);
      const order = mode === '1v1' ? [black, 1 - black] : black === 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
      order.forEach((seat, x) => {
        assert.equal(room.state.currentSeat, seat); room.place(`p${seat}`, x, 7);
        assert.equal(room.state.board[7][x], x % 2 === 0 ? 1 : 2);
      });
    }
  }
});

test('draws swap colors but games ending before colors are chosen still use RPS', () => {
  const room = setup().room;
  room.finish(null, '무승부'); room.reset('p0');
  room.ready('p0'); room.ready('p1'); room.start('p0');
  assert.equal(room.state.phase, 'playing'); assert.equal(room.state.blackTeam, 1);
  const first = new GameRoom('FIRST', '첫 판', '1v1', 'p0');
  for (let i = 0; i < 2; i++) { first.add(`p${i}`, `사람${i}`); first.ready(`p${i}`); }
  first.start('p0'); first.resign('p1'); first.reset('p0');
  first.ready('p0'); first.ready('p1'); first.start('p0');
  assert.equal(first.state.phase, 'rps'); assert.equal(first.state.blackTeam, null);
});
