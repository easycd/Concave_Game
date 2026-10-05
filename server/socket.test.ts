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
    s.on('chat', message => { const r = views.get(index); if (r) views.set(index, { ...r, chat: [...r.chat, message].slice(-100) }); });
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
    const created = await send(players[0], 'create', { name: '온라인 검증', mode: '2v2', turnSeconds: 60 }); assert.equal(created.ok, true); const code = created.code!;
    for (let i = 1; i < 7; i++) assert.equal((await send(players[i], 'join', { code })).ok, true);
    assert.equal((await send(players[7], 'join', { code, spectator: true })).ok, false);
    assert.equal((await send(players[4], 'ready')).ok, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(players[i], 'ready')).ok, true);
    assert.equal((await send(players[1], 'start')).ok, false);
    assert.equal((await send(players[0], 'start')).ok, true);
    assert.equal((await send(players[0], 'rps', { gesture: 'rock' })).ok, true);
    assert.equal((await send(players[1], 'rps', { gesture: 'scissors' })).ok, true);
    assert.equal(views.get(0)?.turnSeconds, 60);
    assert.equal((await send(players[4], 'move', { x: 7, y: 7 })).ok, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(players[i], 'move', { x: i, y: 7 })).ok, true);
    await waitFor(() => views.get(6)?.moves.length === 4);
    assert.equal(views.get(6)?.moves.length, 4); assert.equal(views.get(6)?.currentSeat, 0);
    assert.equal((await send(players[4], 'chat', { text: '관전자도 응원해요' })).ok, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(views.get(0)?.chat.at(-1)?.text, '관전자도 응원해요');
    const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => new Promise<Reply>(resolve => players[4].emit('chat', { text: `연속채팅${i}` }, resolve))));
    assert.ok(burst.every(r => r.ok));
    await waitFor(() => views.get(0)?.chat.at(-1)?.text === '연속채팅19');
    const simultaneous = await Promise.all([
      new Promise<Reply>(resolve => players[0].emit('chat', { text: '돌 놓으며 채팅' }, resolve)),
      new Promise<Reply>(resolve => players[0].emit('move', { x: 8, y: 8 }, resolve)),
      new Promise<Reply>(resolve => players[0].emit('chat', { text: '착수 직후 채팅' }, resolve)),
    ]);
    assert.ok(simultaneous.every(r => r.ok));
    await waitFor(() => views.get(6)?.moves.length === 5);
    players[2].disconnect();
    await new Promise(resolve => setTimeout(resolve, 50));
    const reconnected = await connect(2, tokens[2]);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(views.get(2)?.players.find(p => p.id === tokens[2])?.seat, 2);
    assert.equal(views.get(2)?.moves.length, 5);
    assert.equal((await send(reconnected, 'leave')).ok, true);
    await waitFor(() => views.get(0)?.phase === 'finished');
    assert.equal(views.get(0)?.result?.winner, 1);
    for (const i of [0, 1, 3]) assert.equal((await send(players[i], 'leave')).ok, true);
    await waitFor(() => views.get(4) === null);
    assert.equal(server.rooms.has(code), false);
    assert.equal((await send(players[7], 'join', { code })).ok, false);
    const instantRoom = await send(players[7], 'create', { name: '즉시 홈 이동', mode: '1v1' });
    assert.equal(instantRoom.ok, true);
    const instantLeave = await new Promise<Reply>(resolve => players[7].emit('leave', {}, resolve));
    assert.equal(instantLeave.ok, true);
    assert.equal(server.rooms.has(instantRoom.code!), false);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
