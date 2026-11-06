import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { MemoryAccountStore } from './accounts.js';
import { createGameServer } from './index.js';
import type { HomeUser } from './homeAuth.js';
import { readHomeToken } from './homeAuth.js';

// Stand-in for the homepage: cookie token → member
const members = new Map<string, HomeUser>([
  ['a'.repeat(64), { id: '11111111-1111-4111-8111-111111111111', name: '하나', nickname: '랭커하나' }],
  ['b'.repeat(64), { id: '22222222-2222-4222-8222-222222222222', name: '둘', nickname: '랭커둘' }],
]);
const verifySession = async (cookie?: string) => members.get(readHomeToken(cookie) ?? '') ?? null;

test('homepage login links to omok records, ranking and admin internal API', async () => {
  const accounts = new MemoryAccountStore();
  const server = createGameServer({ accountStore: accounts, verifySession, internalToken: 'secret-token' });
  await server.ready;
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  let onlineUsers: any[] = [];
  const cookies = ['wj_session=' + 'a'.repeat(64), 'wj_session=' + 'b'.repeat(64)];
  try {
    assert.equal((await fetch(`${url}/api/me`)).status, 401, '로그인 안 하면 401');
    assert.equal((await fetch(`${url}/api/me`, { headers: { Cookie: 'wj_session=' + 'c'.repeat(64) } })).status, 401, '모르는 세션은 401');
    const me = await (await fetch(`${url}/api/me`, { headers: { Cookie: cookies[0] } })).json();
    assert.equal(me.account.nickname, '랭커하나');
    for (const path of ['/api/auth/register', '/api/auth/login']) {
      const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"nickname":"x","password":"yyyyyyyy"}' });
      assert.notEqual(r.status, 201); assert.notEqual(r.status, 200, `${path} 는 더 이상 없어야 함`);
    }
    const anonymous = io(url, { forceNew: true, reconnection: false });
    await new Promise<void>(resolve => { anonymous.once('connect_error', () => resolve()); anonymous.once('connect', () => { assert.fail('로그인 없이 소켓 연결됨'); }); });
    anonymous.close();
    for (const cookie of cookies) {
      const socket = io(url, { forceNew: true, extraHeaders: { Cookie: cookie } }); sockets.push(socket);
      socket.on('onlineUsers', users => { onlineUsers = users; });
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    }
    const send = (socket: Socket, event: string, data = {}) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(event, data, (error: Error | null, reply: any) => error ? reject(error) : resolve(reply)));
    const pause = () => new Promise(resolve => setTimeout(resolve, 70));
    const created = await send(sockets[0], 'create', { name: '랭킹 검증', mode: '1v1' }); assert.equal(created.ok, true);
    assert.equal((await send(sockets[1], 'join', { code: created.code })).ok, true);
    await pause(); assert.equal((await send(sockets[0], 'ready')).ok, true); await pause(); assert.equal((await send(sockets[1], 'ready')).ok, true);
    await pause(); assert.equal((await send(sockets[0], 'rps', { gesture: 'rock' })).ok, true);
    await pause(); assert.equal((await send(sockets[1], 'rps', { gesture: 'scissors' })).ok, true);
    await pause(); assert.equal((await send(sockets[1], 'resign')).ok, true);
    const deadline = Date.now() + 2000;
    while ((await accounts.leaderboard())[0]?.wins !== 1) { if (Date.now() > deadline) throw new Error('전적 저장 시간 초과'); await new Promise(r => setTimeout(r, 20)); }
    const ranking = await (await fetch(`${url}/api/ranking`)).json();
    assert.equal(ranking.ranking[0].nickname, '랭커하나'); assert.equal(ranking.ranking[1].losses, 1);
    assert.equal(await accounts.recordGame(server.rooms.get(created.code)!.state.gameId, '1v1', 0, []), false);

    // internal API for the homepage admin dashboard
    const id = members.get('a'.repeat(64))!.id;
    const internal = (method: string, headers: Record<string, string> = {}, body?: object) => fetch(`${url}/internal/users/${id}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await internal('GET')).status, 404, '비밀값 없으면 막힘');
    assert.equal((await internal('GET', { 'X-Internal-Token': 'wrong' })).status, 404);
    assert.equal((await internal('GET', { 'X-Internal-Token': 'secret-token', 'CF-Connecting-IP': '1.2.3.4' })).status, 404, '터널로 들어온 요청은 막힘');
    const record = await (await internal('GET', { 'X-Internal-Token': 'secret-token' })).json();
    assert.equal(record.record.wins, 1);
    assert.equal((await internal('PUT', { 'X-Internal-Token': 'secret-token' }, { nickname: '새이름' })).status, 200);
    assert.equal((await accounts.stats(id))!.nickname, '새이름');
    const kicked = new Promise<void>(resolve => sockets[0].once('signedOut', () => resolve()));
    assert.equal((await (await internal('DELETE', { 'X-Internal-Token': 'secret-token' })).json()).removed, true);
    await kicked;
    assert.equal(await accounts.stats(id), null);
  } finally { sockets.forEach(socket => socket.disconnect()); await server.close(); }
});
