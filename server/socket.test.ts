import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as client, type Socket } from 'socket.io-client';
import { createGameServer } from './index.js';
import { type Reply, type RoomState } from '../src/shared.js';

test('real sockets synchronize 2v2 play, chat, spectators and reconnect', async () => {
  const server = createGameServer();
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  const tokens: string[] = [];
  const views = new Map<number, RoomState | null>();
  async function connect(index: number, token: string = randomUUID()) {
    tokens[index] = token;
    const s = client(url, { auth: { token, nickname: `테스트${index}` }, forceNew: true }); sockets.push(s);
    s.on('room', r => views.set(index, r));
    await new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
    return s;
  }
  async function send(s: Socket, event: string, data = {}): Promise<Reply> {
    await new Promise(resolve => setTimeout(resolve, 75));
    return new Promise((resolve, reject) => s.timeout(2000).emit(event, data, (err: Error | null, r: Reply) => err ? reject(err) : resolve(r)));
  }
  async function waitFor(predicate: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!predicate()) { if (Date.now() >= deadline) throw new Error('동기화 응답 시간 초과'); await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  try {
    const players = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(i => connect(i)));
    const created = await send(players[0], 'create', { name: '온라인 검증', mode: '2v2' }); assert.equal(created.ok, true); const code = created.code!;
    for (let i = 1; i < 7; i++) assert.equal((await send(players[i], 'join', { code })).ok, true);
    assert.equal((await send(players[7], 'join', { code, spectator: true })).ok, false);
    assert.equal((await send(players[4], 'ready')).ok, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(players[i], 'ready')).ok, true);
    assert.equal((await send(players[1], 'start')).ok, false);
    assert.equal((await send(players[0], 'start')).ok, true);
    assert.equal((await send(players[0], 'rps', { gesture: 'rock' })).ok, true);
    assert.equal((await send(players[1], 'rps', { gesture: 'scissors' })).ok, true);
    assert.equal((await send(players[4], 'move', { x: 7, y: 7 })).ok, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(players[i], 'move', { x: i, y: 7 })).ok, true);
    await waitFor(() => views.get(6)?.moves.length === 4);
    assert.equal(views.get(6)?.moves.length, 4); assert.equal(views.get(6)?.currentSeat, 0);
    assert.equal((await send(players[4], 'chat', { text: '관전자도 응원해요' })).ok, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(views.get(0)?.chat.at(-1)?.text, '관전자도 응원해요');
    players[2].disconnect();
    await new Promise(resolve => setTimeout(resolve, 50));
    const reconnected = await connect(2, tokens[2]);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(views.get(2)?.players.find(p => p.id === tokens[2])?.seat, 2);
    assert.equal(views.get(2)?.moves.length, 4);
    assert.equal((await send(reconnected, 'leave')).ok, true);
    await waitFor(() => views.get(0)?.phase === 'finished');
    assert.equal(views.get(0)?.result?.winner, 1);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
