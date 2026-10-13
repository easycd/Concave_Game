import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as client, type Socket } from 'socket.io-client';
import { createGameServer } from './index.js';
import { type ChatMessage, type OnlineUser, type Reply, type RoomInvite, type RoomState, type WhisperMessage } from '../src/shared.js';

test('real sockets synchronize 2v2 play, chat, spectators and reconnect', async () => {
  const server = createGameServer({ allowLegacyAuth: true });
  await server.ready;
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const sockets: Socket[] = [];
  const tokens: string[] = [];
  const views = new Map<number, RoomState | null>();
  const onlineViews = new Map<number, OnlineUser[]>();
  const lobbyViews = new Map<number, ChatMessage[]>();
  const invites = new Map<number, RoomInvite>();
  const whispers = new Map<number, WhisperMessage[]>();
  const whisperClosures = new Map<number, string>();
  const kicks = new Map<number, string>();
  async function connect(index: number, token: string = randomUUID()) {
    tokens[index] = token;
    const s = client(url, { auth: { token, nickname: `테스트${index}` }, forceNew: true }); sockets.push(s);
    s.on('room', r => views.set(index, r));
    s.on('chat', message => { const r = views.get(index); if (r) views.set(index, { ...r, chat: [...r.chat, message].slice(-100) }); });
    s.on('onlineUsers', users => onlineViews.set(index, users));
    s.on('lobbyChatHistory', messages => lobbyViews.set(index, messages));
    s.on('lobbyChat', message => lobbyViews.set(index, [...(lobbyViews.get(index) ?? []), message].slice(-100)));
    s.on('roomInvite', invite => invites.set(index, invite));
    s.on('whisperMessage', ({ message }) => whispers.set(index, [...(whispers.get(index) ?? []), message]));
    s.on('whisperClosed', ({ nickname }) => whisperClosures.set(index, nickname));
    s.on('kicked', ({ roomName }) => kicks.set(index, roomName));
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
    await waitFor(() => onlineViews.get(0)?.length === 8);
    assert.ok(onlineViews.get(0)?.every(user => user.status === 'waiting'));
    assert.equal((await send(players[7], 'lobbyChat', { text: '로비 전체 인사' })).ok, true);
    await waitFor(() => lobbyViews.get(0)?.at(-1)?.text === '로비 전체 인사');
    assert.equal(lobbyViews.get(0)?.at(-1)?.nickname, '테스트7');
    const created = await send(players[0], 'create', { name: '온라인 검증', mode: '2v2', turnSeconds: 60 }); assert.equal(created.ok, true); const code = created.code!;
    for (let i = 1; i < 7; i++) assert.equal((await send(players[i], 'join', { code })).ok, true);
    assert.equal((await send(players[7], 'join', { code, spectator: true })).ok, false);
    assert.equal((await send(players[4], 'ready')).ok, false);
    for (let i = 0; i < 4; i++) assert.equal((await send(players[i], 'ready')).ok, true);
    assert.equal((await send(players[1], 'start')).ok, false);
    assert.equal((await send(players[0], 'start')).ok, true);
    await waitFor(() => onlineViews.get(0)?.find(user => user.id === tokens[0])?.status === 'playing');
    assert.equal(onlineViews.get(0)?.find(user => user.id === tokens[4])?.status, 'waiting');
    assert.equal((await send(players[4], 'lobbyChat', { text: '방 안에서는 전송 불가' })).ok, false);
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
    assert.equal((await send(players[4], 'seat', { seat: 2 })).ok, true);
    await waitFor(() => views.get(6)?.players.find(p => p.id === tokens[4])?.seat === 2);
    assert.equal((await send(players[4], 'seat', { seat: null })).ok, true);
    assert.equal((await send(players[0], 'reset')).ok, true);
    assert.equal((await send(reconnected, 'join', { code })).ok, true);
    for (const s of [players[0], players[1], reconnected, players[3]]) assert.equal((await send(s, 'ready')).ok, true);
    assert.equal((await send(players[0], 'start')).ok, true);
    await waitFor(() => views.get(6)?.phase === 'playing');
    assert.equal(views.get(6)?.blackTeam, 1); assert.equal(views.get(6)?.currentSeat, 1);
    assert.equal(views.get(6)?.rpsResult, null); assert.equal(views.get(6)?.moves.length, 0);
    assert.equal((await send(players[1], 'move', { x: 7, y: 7 })).ok, true);
    await waitFor(() => views.get(6)?.board[7][7] === 1);
    assert.equal((await send(players[0], 'drawOffer')).ok, true);
    await waitFor(() => views.get(6)?.drawOffer?.team === 0);
    assert.equal((await send(players[3], 'drawAnswer', { accept: true })).ok, true);
    await waitFor(() => views.get(6)?.phase === 'finished');
    assert.equal(views.get(6)?.result?.winner, null);
    assert.equal((await send(players[1], 'rematch')).ok, true);
    await waitFor(() => views.get(6)?.rematchOffer?.team === 1);
    assert.equal(views.get(6)?.phase, 'finished');
    assert.equal((await send(players[0], 'rematch')).ok, true);
    await waitFor(() => [0, 1, 2, 3, 6].every(index => views.get(index)?.phase === 'lobby'));
    assert.equal((await send(reconnected, 'leave')).ok, true);
    for (const i of [0, 1, 3]) assert.equal((await send(players[i], 'leave')).ok, true);
    await waitFor(() => views.get(4) === null);
    assert.equal(server.rooms.has(code), false);
    assert.equal((await send(players[7], 'join', { code })).ok, false);
    const protectedRoom = await send(players[7], 'create', { name: '비밀 초대방', mode: '1v1', password: '4321' });
    assert.equal(protectedRoom.ok, true);
    assert.equal((await send(players[6], 'join', { code: protectedRoom.code })).ok, false);
    assert.equal((await send(players[6], 'join', { code: protectedRoom.code, password: 'wrong' })).ok, false);
    assert.equal((await send(players[7], 'invite', { targetId: tokens[6] })).ok, true);
    await waitFor(() => invites.get(6)?.roomCode === protectedRoom.code);
    assert.equal(invites.get(6)?.locked, true);
    assert.equal((await send(players[7], 'whisperOpen', { targetId: tokens[6] })).ok, true);
    assert.equal((await send(players[7], 'whisperMessage', { targetId: tokens[6], text: '비밀 초대 메시지' })).ok, true);
    await waitFor(() => whispers.get(6)?.at(-1)?.text === '비밀 초대 메시지');
    assert.equal((await send(players[6], 'whisperClose', { targetId: tokens[7] })).ok, true);
    await waitFor(() => whisperClosures.get(7) === '테스트6');
    assert.equal((await send(players[6], 'join', { code: protectedRoom.code, password: '4321' })).ok, true);
    assert.equal((await send(players[7], 'kick', { targetId: tokens[6] })).ok, true);
    await waitFor(() => kicks.get(6) === '비밀 초대방' && views.get(6) === null);
    assert.equal((await send(players[6], 'join', { code: protectedRoom.code, password: '4321' })).ok, true);
    assert.equal((await send(players[6], 'leave')).ok, true);
    const instantLeave = await new Promise<Reply>(resolve => players[7].emit('leave', {}, resolve));
    assert.equal(instantLeave.ok, true);
    assert.equal(server.rooms.has(protectedRoom.code!), false);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
