import test from 'node:test';
import assert from 'node:assert/strict';
import { renjuForbidden, renjuForbiddenMoves } from '../src/renju.js';
import { GameRoom } from './game.js';

const board = () => Array.from({ length: 15 }, () => Array<number>(15).fill(0));
function put(b: number[][], points: number[][], color = 1) { points.forEach(([x, y]) => b[y][x] = color); }

test('Renju detects open and broken double threes without changing the board', () => {
  const b = board(); put(b, [[6, 7], [8, 7], [7, 6], [7, 8]]);
  const before = structuredClone(b);
  assert.equal(renjuForbidden(b, 7, 7), '삼삼');
  assert.deepEqual(b, before);
  assert.ok(renjuForbiddenMoves(b).some(p => p.x === 7 && p.y === 7 && p.reason === '삼삼'));
  const broken = board(); put(broken, [[5, 7], [8, 7], [7, 5], [7, 8]]);
  assert.equal(renjuForbidden(broken, 7, 7), '삼삼');
});

test('Renju counts fours by their stones, including two fours in the same direction', () => {
  const b = board(); put(b, [[5, 7], [6, 7], [8, 7]]);
  assert.equal(renjuForbidden(b, 7, 7), null); // One straight four with two winning ends.
  put(b, [[7, 5], [7, 6], [7, 8]]);
  assert.equal(renjuForbidden(b, 7, 7), '사사');
  const same = board(); put(same, [[4, 7], [6, 7], [8, 7], [10, 7]]);
  assert.equal(renjuForbidden(same, 7, 7), '사사');
});

test('Renju ignores blocked threes, edge threes and extensions forbidden by overline', () => {
  const b = board(); put(b, [[6, 7], [8, 7], [7, 6], [7, 8]]); put(b, [[7, 5]], 2);
  assert.equal(renjuForbidden(b, 7, 7), null);
  const edge = board(); put(edge, [[0, 6], [0, 8], [1, 7], [2, 7]]);
  assert.equal(renjuForbidden(edge, 0, 7), null);
  const fake = board(); put(fake, [[6, 7], [8, 7], [7, 6], [7, 8]]);
  // Both vertical-three extensions would create horizontal overlines.
  for (const y of [5, 9]) put(fake, [[4, y], [5, y], [6, y], [8, y], [9, y]]);
  assert.equal(renjuForbidden(fake, 7, 7), null);
  const doubleFourExtension = board();
  put(doubleFourExtension, [[6, 7], [8, 7], [7, 6], [7, 8]]);
  for (const y of [5, 9]) put(doubleFourExtension, [[5, y], [6, y], [8, y]]);
  assert.equal(renjuForbidden(doubleFourExtension, 7, 7), null);
});

test('Renju forbids overlines but an exact five takes precedence over other patterns', () => {
  const b = board(); put(b, [[4, 7], [5, 7], [6, 7], [8, 7], [9, 7]]);
  assert.equal(renjuForbidden(b, 7, 7), '장목');
  put(b, [[7, 3], [7, 4], [7, 5], [7, 6]]);
  assert.equal(renjuForbidden(b, 7, 7), null);
  const room = new GameRoom('WIN', '렌주', '1v1', 'p0', () => 0, 30, 'renju');
  room.state.board = b;
  b[7][7] = 1;
  assert.equal(room.findLine(7, 7, 1).length, 5);
  assert.equal(room.findLine(7, 7, 1).every(([x]) => x === 7), true);
});

test('Server enforces the selected rule for both modes and leaves rejected moves unchanged', () => {
  for (const mode of ['1v1', '2v2'] as const) {
    const room = new GameRoom('RENJU1', '렌주', mode, 'p0', () => 0, 30, 'renju');
    for (let i = 0; i < (mode === '1v1' ? 2 : 4); i++) { room.add(`p${i}`, `사람${i}`); room.ready(`p${i}`); }
    room.start('p0'); room.choose('p0', 'rock'); room.choose('p1', 'scissors');
    put(room.state.board, [[6, 7], [8, 7], [7, 6], [7, 8]]);
    const deadline = room.state.deadline;
    assert.throws(() => room.place('p0', 7, 7), /삼삼/);
    assert.equal(room.state.moves.length, 0); assert.equal(room.state.board[7][7], 0);
    assert.equal(room.state.currentSeat, 0); assert.equal(room.state.deadline, deadline);
    assert.ok(room.view().forbiddenMoves.some(p => p.x === 7 && p.y === 7));
    room.state.currentSeat = 1;
    assert.deepEqual(room.view().forbiddenMoves, []);
    room.place('p1', 7, 7); assert.equal(room.state.board[7][7], 2);
    room.state.rules = 'freestyle'; room.state.currentSeat = 0;
    put(room.state.board, [[4, 10], [5, 10], [6, 10], [8, 10], [9, 10]]);
    room.place('p0', 7, 10); assert.equal(room.state.result?.winner, 0);
  }
  assert.throws(() => new GameRoom('BAD', '방', '1v1', 'p0', () => 0, 30, 'bad' as 'renju'));
});
