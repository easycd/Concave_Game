import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { MemoryAccountStore } from './accounts.js';
import { createGameServer } from './index.js';

test('accounts reject duplicate nicknames and wrong passwords, then persist one ranked result', async () => {
  const accounts = new MemoryAccountStore();
  const server = createGameServer({ accountStore: accounts });
  await server.ready;
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  const post = (path: string, body: object) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const registrations = await Promise.all([
      post('/api/auth/register', { nickname: '랭커하나', password: 'secret1' }),
      post('/api/auth/register', { nickname: '랭커둘', password: 'secret2' }),
    ]);
    assert.deepEqual(registrations.map(response => response.status), [201, 201]);
    const cookies = registrations.map(response => response.headers.get('set-cookie')!.split(';')[0]);
    const duplicate = await post('/api/auth/register', { nickname: '랭커하나', password: 'another' });
    assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).error, '중복된 닉네임입니다.');
    const wrong = await post('/api/auth/login', { nickname: '랭커하나', password: 'wrongpw' });
    assert.equal(wrong.status, 401); assert.equal((await wrong.json()).error, '비밀번호가 다릅니다.');
    for (const cookie of cookies) {
      const socket = io(url, { forceNew: true, extraHeaders: { Cookie: cookie } }); sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    }
    const send = (socket: Socket, event: string, data = {}) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(event, data, (error: Error | null, reply: any) => error ? reject(error) : resolve(reply)));
    const created = await send(sockets[0], 'create', { name: '랭킹 검증', mode: '1v1' }); assert.equal(created.ok, true);
    assert.equal((await send(sockets[1], 'join', { code: created.code })).ok, true);
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal((await send(sockets[0], 'ready')).ok, true); await new Promise(resolve => setTimeout(resolve, 70)); assert.equal((await send(sockets[1], 'ready')).ok, true);
    await new Promise(resolve => setTimeout(resolve, 70)); assert.equal((await send(sockets[0], 'start')).ok, true);
    await new Promise(resolve => setTimeout(resolve, 70)); assert.equal((await send(sockets[0], 'rps', { gesture: 'rock' })).ok, true);
    await new Promise(resolve => setTimeout(resolve, 70)); assert.equal((await send(sockets[1], 'rps', { gesture: 'scissors' })).ok, true);
    await new Promise(resolve => setTimeout(resolve, 70)); assert.equal((await send(sockets[1], 'resign')).ok, true);
    const ranking = await new Promise<any[]>(async (resolve, reject) => {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) { const rows = await accounts.leaderboard(); if (rows[0]?.wins === 1) return resolve(rows); await new Promise(wait => setTimeout(wait, 20)); }
      reject(new Error('전적 저장 시간 초과'));
    });
    assert.equal(ranking[0].nickname, '랭커하나'); assert.equal(ranking[0].wins, 1); assert.equal(ranking[1].losses, 1);
    assert.equal(await accounts.recordGame(server.rooms.get(created.code)!.state.gameId, '1v1', 0, []), false);
  } finally { sockets.forEach(socket => socket.disconnect()); await server.close(); }
});
