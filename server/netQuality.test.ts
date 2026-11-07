import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeOf, NetQuality, SLOW_MOVE_MS } from './netQuality.js';

test('edgeOf reads the Cloudflare city from CF-Ray', () => {
  assert.equal(edgeOf('8f1c2a3b4c5d6e7f-LAX'), 'LAX');
  assert.equal(edgeOf('a56ab9995aa1d007-ICN'), 'ICN');
  assert.equal(edgeOf(undefined), '?');
  assert.equal(edgeOf('garbage'), '?');
});

test('NetQuality keeps valid samples, logs slow moves and summarises', () => {
  const lines: string[] = [];
  const net = new NetQuality('철수', 'LAX', line => lines.push(line));
  assert.equal(net.summary(), null);
  net.report({ ping: 80, moves: [120] });
  net.report({ ping: 300.4, moves: [SLOW_MOVE_MS + 500, -1, 'x', 70_000] });
  net.report({ ping: 'fast' });
  net.report(null);
  assert.deepEqual(lines, [`오목 느린 착수 ${SLOW_MOVE_MS + 500}ms · 철수 · 경유 LAX`]);
  const summary = net.summary()!;
  assert.match(summary, /경유 LAX/);
  assert.match(summary, /핑 중앙 300 · 90% 300 · 최대 300ms \(2번\)/);
  assert.match(summary, /착수 응답 .*최대 2000ms \(2번\)/);
});

test('NetQuality ignores oversized move lists beyond 10 entries', () => {
  const lines: string[] = [];
  const net = new NetQuality('영희', '?', line => lines.push(line));
  net.report({ moves: Array.from({ length: 50 }, () => SLOW_MOVE_MS) });
  assert.equal(lines.length, 10);
});
