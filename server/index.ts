import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { GameRoom } from './game.js';
import { type Reply, type RoomSummary } from '../src/shared.js';
import { createAccountStore, type AccountStore } from './accounts.js';

const { createNightfall, handleNightfallRequest } = await import(pathToFileURL(path.resolve(process.cwd(), 'nightfall/server.js')).href);

export function createGameServer(options: { accountStore?: AccountStore; allowLegacyAuth?: boolean } = {}) {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 16_384 });
  const nightfall = createNightfall(io);
  const accounts = options.accountStore ?? createAccountStore();
  const ready = accounts.init();
  const rooms = new Map<string, GameRoom>();
  const sessions = new Map<string, { nickname: string; room: string | null; socketId: string | null; disconnectedAt: number | null; lastAction: number }>();
  const summaries = (): RoomSummary[] => [...rooms.values()].map(({ state: s }) => ({ code: s.code, name: s.name, mode: s.mode, rules: s.rules, phase: s.phase, players: s.players.filter(p => p.seat !== null).length, spectators: s.players.filter(p => p.seat === null).length }));
  const directory = () => io.emit('rooms', summaries());
  const broadcast = (room: GameRoom) => { io.to(room.state.code).emit('room', room.view()); directory(); };
  const afterRemoval = (room: GameRoom) => {
    if (room.state.players.some(p => p.seat !== null)) { broadcast(room); return; }
    const code = room.state.code;
    rooms.delete(code);
    io.to(code).emit('room', null);
    io.to(code).emit('roomClosed');
    for (const session of sessions.values()) if (session.room === code) session.room = null;
    io.in(code).socketsLeave(code);
    directory();
  };
  const cleanText = (value: unknown, max: number) => { if (typeof value !== 'string') throw new Error('텍스트를 입력해주세요.'); const v = value.trim().replace(/[\u0000-\u001f\u007f]/g, ''); if (!v || v.length > max) throw new Error(`1~${max}자로 입력해주세요.`); return v; };
  const cleanNickname = (value: unknown) => cleanText(value, 12);
  const cleanPassword = (value: unknown) => { if (typeof value !== 'string' || value.length < 6 || value.length > 72) throw new Error('비밀번호는 6~72자로 입력해주세요.'); return value; };
  const cookieName = 'gomoku_session';
  const readCookie = (header = '') => Object.fromEntries(header.split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2))[cookieName];
  const setSessionCookie = (res: express.Response, token: string) => res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  app.use(express.json({ limit: '2kb' }));
  app.post('/api/auth/register', async (req, res) => {
    try { await ready; const account = await accounts.register(cleanNickname(req.body?.nickname), cleanPassword(req.body?.password)); const token = await accounts.createSession(account.id); setSessionCookie(res, token); res.status(201).json({ ok: true, account }); }
    catch (error) { const message = error instanceof Error ? error.message : '회원가입에 실패했습니다.'; res.status(message === '중복된 닉네임입니다.' ? 409 : 400).json({ ok: false, error: message }); }
  });
  app.post('/api/auth/login', async (req, res) => {
    try { await ready; const account = await accounts.login(cleanNickname(req.body?.nickname), cleanPassword(req.body?.password)); if (!account) return res.status(401).json({ ok: false, error: '비밀번호가 다릅니다.' }); const token = await accounts.createSession(account.id); setSessionCookie(res, token); res.json({ ok: true, account }); }
    catch (error) { res.status(400).json({ ok: false, error: error instanceof Error ? error.message : '로그인에 실패했습니다.' }); }
  });
  app.post('/api/auth/logout', async (req, res) => { const token = readCookie(req.headers.cookie); if (token) await accounts.logout(token); res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); res.json({ ok: true }); });
  app.get('/api/me', async (req, res) => { const token = readCookie(req.headers.cookie); const account = token ? await accounts.authenticate(token) : null; if (!account) return res.status(401).json({ ok: false }); res.json({ ok: true, account }); });
  app.get('/api/ranking', async (_req, res) => { await ready; res.json({ ok: true, ranking: await accounts.leaderboard() }); });
  io.use((socket, next) => {
    void (async () => {
      try {
        await ready;
        const sessionToken = readCookie(socket.handshake.headers.cookie);
        const account = sessionToken ? await accounts.authenticate(sessionToken) : null;
        if (account) { socket.data.token = account.id; socket.data.nickname = account.nickname; socket.data.account = account; return next(); }
        if (!options.allowLegacyAuth) throw new Error('로그인이 필요합니다.');
        const { token, nickname } = socket.handshake.auth;
        if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) throw new Error('접속 정보가 올바르지 않습니다.');
        socket.data.token = token; socket.data.nickname = cleanNickname(nickname); next();
      } catch (e) { next(e instanceof Error ? e : new Error('접속 실패')); }
    })();
  });
  io.on('connection', socket => {
    const token: string = socket.data.token;
    const existing = sessions.get(token);
    if (existing?.socketId) io.sockets.sockets.get(existing.socketId)?.disconnect(true);
    const session = existing ?? { nickname: socket.data.nickname, room: null, socketId: null, disconnectedAt: null, lastAction: 0 };
    if (!session.room) session.nickname = socket.data.nickname;
    session.socketId = socket.id; session.disconnectedAt = null; sessions.set(token, session);
    socket.emit('identity', { id: token, nickname: session.nickname }); socket.emit('rooms', summaries());
    const oldRoom = session.room ? rooms.get(session.room) : null;
    if (oldRoom) { oldRoom.player(token).connected = true; socket.join(oldRoom.state.code); broadcast(oldRoom); }
    else { session.room = null; socket.emit('room', null); }
    const active = () => { const room = session.room && rooms.get(session.room); if (!room) throw new Error('먼저 방에 입장해주세요.'); return room; };
    const leave = () => {
      if (!session.room) return;
      const code = session.room; const room = rooms.get(code); session.room = null; socket.leave(code);
      if (room) { room.remove(token); if (room.state.phase === 'finished') socket.emit('room', room.view()); afterRemoval(room); }
      socket.emit('room', null); directory();
    };
    const action = (event: string, fn: (data: any) => Reply | void) => socket.on(event, (data: unknown, ack: unknown) => {
      const reply = typeof ack === 'function' ? ack as (r: Reply) => void : () => {};
      try {
        if (session.socketId !== socket.id) throw new Error('다른 창에서 연결되었습니다.');
        if (event !== 'chat' && event !== 'leave') {
          if (Date.now() - session.lastAction < 60) throw new Error('잠시 후 다시 시도해주세요.');
          session.lastAction = Date.now();
        }
        const result = fn(data); reply(result ?? { ok: true });
      } catch (e) { reply({ ok: false, error: e instanceof Error ? e.message : '요청 처리에 실패했습니다.' }); }
    });
    action('create', data => {
      if (session.room) throw new Error('현재 방에서 나간 뒤 새 방을 만들어주세요.');
      if (rooms.size >= 100) throw new Error('방이 모두 찼습니다. 잠시 후 시도해주세요.');
      if (!data || !['1v1', '2v2'].includes(data.mode)) throw new Error('게임 모드를 선택해주세요.');
      const name = cleanText(data.name, 30);
      let code: string; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
      const room = new GameRoom(code, name, data.mode, token, () => Date.now(), data.turnSeconds ?? 30, data.rules ?? 'freestyle', finished => {
        const result = finished.state.result; if (!result) return;
        const players = finished.state.players.filter(player => player.seat !== null).map(player => ({ id: player.id, team: (player.seat! % 2) as 0 | 1 }));
        void accounts.recordGame(finished.state.gameId, finished.state.mode, result.winner, players).then(changed => {
          if (!changed) return;
          for (const client of io.sockets.sockets.values()) if (players.some(player => player.id === client.data.token)) client.emit('statsUpdated');
        }).catch(error => console.error('전적 저장 실패:', error));
      }); room.add(token, session.nickname);
      rooms.set(code, room); session.room = code; socket.join(code); broadcast(room); return { ok: true, code };
    });
    action('join', data => {
      if (session.room) throw new Error('현재 방에서 먼저 나가주세요.');
      const code = cleanText(data?.code, 6).toUpperCase(); const room = rooms.get(code);
      if (!room) throw new Error('방 코드를 확인해주세요.');
      room.add(token, session.nickname, data.spectator === true); session.room = code; socket.join(code); broadcast(room); return { ok: true, code };
    });
    action('leave', leave);
    action('seat', data => { const room = active(); room.switchSeat(token, data?.seat); broadcast(room); });
    action('ready', () => { const room = active(); room.ready(token); broadcast(room); });
    action('start', () => { const room = active(); room.start(token); broadcast(room); });
    action('rps', data => { const room = active(); room.choose(token, data?.gesture); broadcast(room); });
    action('move', data => { const room = active(); room.place(token, data?.x, data?.y); broadcast(room); });
    action('resign', () => { const room = active(); room.resign(token); broadcast(room); });
    action('reset', () => { const room = active(); room.reset(token); broadcast(room); });
    action('rematch', () => { const room = active(); room.requestRematch(token); broadcast(room); });
    action('drawOffer', () => { const room = active(); room.offerDraw(token); broadcast(room); });
    action('drawAnswer', data => { const room = active(); room.answerDraw(token, data?.accept); broadcast(room); });
    action('chat', data => {
      const room = active();
      const msg = cleanText(data?.text, 200); room.message(msg, session.nickname, false);
      io.to(room.state.code).emit('chat', room.state.chat.at(-1));
    });
    socket.on('disconnect', () => {
      if (session.socketId !== socket.id) return;
      session.socketId = null; session.disconnectedAt = Date.now();
      const room = session.room && rooms.get(session.room);
      if (room) { const p = room.player(token); p.connected = false; p.ready = false; broadcast(room); }
    });
  });
  const interval = setInterval(() => {
    for (const room of rooms.values()) if (room.tick()) broadcast(room);
    for (const [id, session] of sessions) {
      if (session.disconnectedAt && Date.now() - session.disconnectedAt >= 20_000 && session.room) {
        const room = rooms.get(session.room); session.room = null;
        if (room) { room.remove(id); afterRemoval(room); }
      }
      if (!session.socketId && !session.room && session.disconnectedAt && Date.now() - session.disconnectedAt > 60_000) sessions.delete(id);
    }
  }, 100);
  interval.unref();
  app.use((req, res, next) => {
    void handleNightfallRequest(req, res).then((handled: boolean) => { if (!handled) next(); }).catch(next);
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  const dist = path.resolve(process.cwd(), 'dist');
  app.use(express.static(dist, { setHeaders: (res, file) => { if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store'); } }));
  app.get('/{*path}', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(dist, 'index.html')); });
  return { http, io, rooms, ready, accounts, close: async () => { clearInterval(interval); nightfall.close(); await new Promise<void>(resolve => io.close(() => resolve())); await accounts.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = createGameServer(); const port = Number(process.env.PORT) || 3001;
  void game.ready.then(() => game.http.listen(port, '0.0.0.0', () => console.log(`오목 서버: http://localhost:${port}`))).catch(error => { console.error('서버 초기화 실패:', error); process.exit(1); });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10000); timeout.unref();
    void game.close().then(() => { clearTimeout(timeout); process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
