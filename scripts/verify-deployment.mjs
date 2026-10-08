import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../build/server/index.js';

test('compiled production server serves frontend and real WebSocket rooms', async () => {
  const server = createGameServer();
  const clients = [];
  try {
    await server.ready;
    await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.http.address().port}`;
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
    const html = await (await fetch(url)).text(); assert.match(html, /오목/);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m => m[1]);
    assert.equal(assets.length, 2);
    for (const asset of [...assets, '/board.png']) assert.equal((await fetch(url + asset)).status, 200);
    const css = await (await fetch(url + assets.find(p => p.endsWith('.css')))).text();
    assert.ok(!css.includes('fonts.googleapis.com'));
    for (const [index, nickname] of ['운영검증1', '운영검증2'].entries()) {
      const registration = await fetch(`${url}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname, password: `verify${index + 1}` }) });
      assert.equal(registration.status, 201);
      const cookie = registration.headers.get('set-cookie').split(';')[0];
      const socket = io(url, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: cookie } });
      clients.push(socket);
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      assert.equal(socket.io.engine.transport.name, 'websocket');
    }
    const request = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
    const created = await request(clients[0], 'create', { name: '공개서버 검증', mode: '1v1' }); assert.equal(created.ok, true);
    const joined = await request(clients[1], 'join', { code: created.code }); assert.equal(joined.ok, true);
    assert.equal(server.rooms.get(created.code).state.players.length, 2);
  } finally { clients.forEach(socket => socket.disconnect()); await server.close(); }
});
