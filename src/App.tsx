import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Crown, Eye, Flag, Lock, LogOut, MessageCircle, MessageSquare, Plus, Radio, Send, Shield, Trophy, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { type AccountStats, type AuthReply, type ChatMessage, type Gesture, type Mode, type OnlineUser, type RuleSet, type Player, type Reply, type RoomInvite, type RoomState, type RoomSummary, type WhisperMessage, seatsFor, teamOf } from './shared';

const phaseLabel = { lobby: '대기 중', rps: '가위바위보', playing: '대국 중', finished: '대국 종료' };
const gestures: { value: Gesture; label: string; symbol: string }[] = [{ value: 'scissors', label: '가위', symbol: '✌️' }, { value: 'rock', label: '바위', symbol: '✊' }, { value: 'paper', label: '보', symbol: '🖐️' }];
const invitedCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

type WhisperWindow = { peerId: string; nickname: string; messages: WhisperMessage[]; draft: string; minimized: boolean; closed: boolean };

function Brand({ small = false, onHome }: { small?: boolean; onHome?: () => void }) {
  const content = <><span className="brand-mark"><i /><i /></span><span>오목</span></>;
  return <a href="/" className={`brand brand-home ${small ? 'small' : ''}`} aria-label="오목 메인 페이지로 이동" onClick={e => { if (onHome) { e.preventDefault(); onHome(); } }}>{content}</a>;
}
function Stone({ color, small = false }: { color: 'black' | 'white'; small?: boolean }) { return <span className={`stone ${color} ${small ? 'tiny' : ''}`} />; }

export default function App() {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [account, setAccount] = useState<AccountStats | null>(null);
  const [ranking, setRanking] = useState<AccountStats[]>([]);
  const [entered, setEntered] = useState(false);
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [lobbyMessages, setLobbyMessages] = useState<ChatMessage[]>([]);
  const [lobbyChat, setLobbyChat] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [rules, setRules] = useState<RuleSet>('freestyle');
  const [mode, setMode] = useState<Mode>('1v1');
  const [roomName, setRoomName] = useState('함께 한 판');
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [joinCode, setJoinCode] = useState(invitedCode);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'resign' | 'home' | null>(null);
  const [resultReveal, setResultReveal] = useState(false);
  const [rpsReveal, setRpsReveal] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const socket = useRef<Socket | null>(null);
  const [chat, setChat] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const lobbyChatEnd = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [records, setRecords] = useState<RoomState[]>([]);
  const rosters = useRef(new Map<string, Player[]>());
  const [roomPassword, setRoomPassword] = useState('');
  const [joinPrompt, setJoinPrompt] = useState<{ code: string; spectator: boolean; roomName?: string } | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [roomInvite, setRoomInvite] = useState<RoomInvite | null>(null);
  const [kickNotice, setKickNotice] = useState('');
  const [kickTarget, setKickTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [directoryMinimized, setDirectoryMinimized] = useState(false);
  const [whisperWindows, setWhisperWindows] = useState<WhisperWindow[]>([]);

  useEffect(() => {
    if (!room?.rpsResult) { setRpsReveal(false); return; }
    setRpsReveal(true);
    const timer = setTimeout(() => setRpsReveal(false), 3000);
    return () => clearTimeout(timer);
  }, [room?.gameId, room?.rpsResult?.winner]);

  useEffect(() => {
    const clearHistory = () => { setRecords([]); rosters.current.clear(); };
    window.addEventListener('pagehide', clearHistory);
    return () => window.removeEventListener('pagehide', clearHistory);
  }, []);

  useEffect(() => { setResultReveal(room?.phase === 'finished'); }, [room?.gameId, room?.phase]);

  async function refreshAccount() {
    try {
      const [meResponse, rankingResponse] = await Promise.all([fetch('/api/me'), fetch('/api/ranking')]);
      if (meResponse.ok) { const data = await meResponse.json(); setAccount(data.account); setNickname(data.account.nickname); }
      if (rankingResponse.ok) setRanking((await rankingResponse.json()).ranking);
    } catch { /* Socket reconnection UI already reports temporary network loss. */ }
  }
  useEffect(() => { if (entered) void refreshAccount(); }, [entered]);

  function notice(text: string) { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); }
  useEffect(() => {
    const refreshTime = () => setNow(Date.now());
    const t = setInterval(refreshTime, 100);
    document.addEventListener('visibilitychange', refreshTime);
    window.addEventListener('focus', refreshTime);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', refreshTime); window.removeEventListener('focus', refreshTime); };
  }, []);
  useEffect(() => { const messages = chatEnd.current?.parentElement; if (messages) messages.scrollTop = messages.scrollHeight; }, [room?.chat.at(-1)?.id]);
  useEffect(() => { const messages = lobbyChatEnd.current?.parentElement; if (messages) messages.scrollTop = messages.scrollHeight; }, [lobbyMessages.at(-1)?.id]);
  useEffect(() => { document.querySelectorAll<HTMLElement>('.whisper-messages').forEach(messages => { messages.scrollTop = messages.scrollHeight; }); }, [whisperWindows.map(window => window.messages.at(-1)?.id).join('|')]);
  useEffect(() => {
    if (!entered) return;
    const s = io({ reconnectionDelay: 500, reconnectionDelayMax: 2000 }); socket.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => { setConnected(false); setPending(false); });
    s.on('connect_error', e => { setConnected(false); notice(e.message === 'xhr poll error' ? '서버에 연결할 수 없습니다. 연결을 다시 시도합니다.' : e.message); });
    s.on('identity', ({ id, nickname: name }: { id: string; nickname: string }) => { setIdentity(id); setNickname(name); });
    s.on('rooms', setRooms);
    s.on('onlineUsers', setOnlineUsers);
    s.on('lobbyChatHistory', setLobbyMessages);
    s.on('lobbyChat', (message: ChatMessage) => setLobbyMessages(previous => [...previous, message].slice(-100)));
    s.on('roomInvite', (invite: RoomInvite) => { setCreating(false); setRoomInvite(invite); });
    s.on('kicked', ({ roomName }: { roomName: string }) => { setRoom(null); setConfirm(null); setKickTarget(null); setHover(null); setResultReveal(false); setKickNotice(`${roomName} 방에서 추방당했습니다.`); });
    s.on('whisperOpened', ({ peer }: { peer: { id: string; nickname: string } }) => { setDirectoryMinimized(true); setWhisperWindows(previous => {
      const existingWindow = previous.find(window => window.peerId === peer.id);
      return existingWindow ? previous.map(window => window.peerId === peer.id ? { ...window, nickname: peer.nickname, minimized: false, closed: false } : window) : [...previous, { peerId: peer.id, nickname: peer.nickname, messages: [], draft: '', minimized: false, closed: false }];
    }); });
    s.on('whisperMessage', ({ peerId, message }: { peerId: string; message: WhisperMessage }) => setWhisperWindows(previous => {
      const existingWindow = previous.find(window => window.peerId === peerId);
      if (!existingWindow) return [...previous, { peerId, nickname: message.nickname, messages: [message], draft: '', minimized: false, closed: false }];
      return previous.map(window => window.peerId === peerId ? { ...window, messages: [...window.messages, message].slice(-100), minimized: false } : window);
    }));
    s.on('whisperClosed', ({ peerId, nickname: peerNickname }: { peerId: string; nickname: string }) => setWhisperWindows(previous => previous.map(window => window.peerId === peerId ? { ...window, closed: true, messages: [...window.messages, { id: crypto.randomUUID(), senderId: null, nickname: '안내', text: `${peerNickname}님이 나갔습니다.`, system: true, time: Date.now() }].slice(-100) } : window)));
    s.on('statsUpdated', () => void refreshAccount());
    s.on('chat', (message: ChatMessage) => setRoom(r => r ? { ...r, chat: [...r.chat, message].slice(-100) } : r));
    s.on('roomClosed', () => notice('모든 플레이어가 퇴장하여 방이 닫혔습니다.'));
    s.on('room', (r: RoomState | null) => {
      if (r) {
        setRoomInvite(null);
        offset.current = r.serverTime - Date.now();
        setNow(Date.now());
        if (r.gameId && ['rps', 'playing'].includes(r.phase) && !rosters.current.has(r.gameId)) rosters.current.set(r.gameId, r.players);
        if (r.phase === 'finished' && r.gameId && rosters.current.has(r.gameId)) setRecords(previous => previous.some(record => record.gameId === r.gameId) ? previous : [{ ...r, players: rosters.current.get(r.gameId)! }, ...previous]);
      }
      setRoom(r);
    });
    return () => { s.disconnect(); socket.current = null; };
    // Nickname is fixed for the lifetime of a connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  async function send(event: string, data: unknown = {}): Promise<boolean> {
    if (!socket.current?.connected) { notice('서버 연결을 기다려주세요.'); return false; }
    if (pending) return false;
    setPending(true);
    return new Promise(resolve => socket.current!.timeout(5000).emit(event, data, (err: Error | null, reply: Reply) => {
      setPending(false);
      if (err) { notice('응답이 늦어지고 있습니다. 화면 상태를 확인해주세요.'); resolve(false); }
      else if (!reply.ok) { notice(reply.error ?? '요청에 실패했습니다.'); resolve(false); }
      else resolve(true);
    }));
  }
  function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = chat.trim();
    if (!text || !socket.current?.connected) return;
    setChat('');
    socket.current.timeout(5000).emit('chat', { text }, (err: Error | null, reply: Reply) => {
      if (err || !reply.ok) notice(err ? '채팅 전송을 확인하지 못했습니다. 연결을 확인해주세요.' : reply.error ?? '채팅 전송에 실패했습니다.');
    });
  }
  function sendLobbyChat(e: FormEvent) {
    e.preventDefault();
    const text = lobbyChat.trim();
    if (!text || !socket.current?.connected || room) return;
    setLobbyChat('');
    socket.current.timeout(5000).emit('lobbyChat', { text }, (err: Error | null, reply: Reply) => {
      if (err || !reply.ok) notice(err ? '전체 채팅 전송을 확인하지 못했습니다.' : reply.error ?? '전체 채팅 전송에 실패했습니다.');
    });
  }
  async function joinRoom(code: string, spectator = false, passwordValue = ''): Promise<boolean> {
    const normalized = code.trim().toUpperCase();
    if (!socket.current?.connected || pending || normalized.length !== 6) return false;
    setPending(true); setJoinError('');
    return new Promise(resolve => socket.current!.timeout(5000).emit('join', { code: normalized, spectator, password: passwordValue }, (err: Error | null, reply: Reply) => {
      setPending(false);
      if (err) { notice('방 입장 응답이 늦어지고 있습니다.'); resolve(false); return; }
      if (!reply.ok) {
        if (reply.error?.includes('비밀번호')) {
          setJoinPrompt(previous => previous ?? { code: normalized, spectator }); setJoinError(reply.error); setJoinPassword('');
        } else notice(reply.error ?? '방에 입장하지 못했습니다.');
        resolve(false); return;
      }
      setJoinPrompt(null); setJoinPassword(''); setJoinError(''); setRoomInvite(null); resolve(true);
    }));
  }
  async function openWhisper(user: OnlineUser) {
    if (await send('whisperOpen', { targetId: user.id })) { setDirectoryMinimized(true); setWhisperWindows(previous => {
      const existingWindow = previous.find(window => window.peerId === user.id);
      return existingWindow ? previous.map(window => window.peerId === user.id ? { ...window, minimized: false, closed: false } : window) : [...previous, { peerId: user.id, nickname: user.nickname, messages: [], draft: '', minimized: false, closed: false }];
    }); }
  }
  async function inviteUser(user: OnlineUser) {
    if (await send('invite', { targetId: user.id })) notice(`${user.nickname}님에게 방 초대를 보냈습니다.`);
  }
  function sendWhisper(e: FormEvent, peerId: string) {
    e.preventDefault();
    const target = whisperWindows.find(window => window.peerId === peerId);
    const text = target?.draft.trim();
    if (!text || target?.closed || !socket.current?.connected) return;
    setWhisperWindows(previous => previous.map(window => window.peerId === peerId ? { ...window, draft: '' } : window));
    socket.current.timeout(5000).emit('whisperMessage', { targetId: peerId, text }, (err: Error | null, reply: Reply) => {
      if (err || !reply.ok) {
        setWhisperWindows(previous => previous.map(window => window.peerId === peerId && !window.draft ? { ...window, draft: text } : window));
        notice(err ? '귓속말 전송을 확인하지 못했습니다.' : reply.error ?? '귓속말을 보내지 못했습니다.');
      }
    });
  }
  function closeWhisper(peerId: string) {
    socket.current?.emit('whisperClose', { targetId: peerId }, () => undefined);
    setWhisperWindows(previous => previous.filter(window => window.peerId !== peerId));
  }
  async function enter(e: FormEvent) {
    e.preventDefault(); if (!nickname.trim() || password.length < 6 || authPending) return;
    setAuthPending(true); setAuthError('');
    try {
      const response = await fetch(`/api/auth/${authMode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nickname.trim(), password }) });
      const data = await response.json() as AuthReply;
      if (!response.ok || !data.account) { setAuthError(data.error ?? '요청을 처리하지 못했습니다.'); return; }
      setAccount(data.account); setNickname(data.account.nickname); setPassword(''); setEntered(true);
    } catch { setAuthError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'); }
    finally { setAuthPending(false); }
  }
  async function goHome() {
    const activeSocket = socket.current;
    if (room && activeSocket?.connected) await new Promise<void>(resolve => {
      activeSocket.timeout(1000).emit('leave', {}, () => resolve());
    });
    setRoom(null); setPending(false); setHistoryOpen(false); setCreating(false); setConfirm(null); setHover(null); setChat('');
    window.history.replaceState(null, '', location.pathname);
    setJoinCode('');
  }
  async function logout() {
    if (room) await goHome();
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    socket.current?.disconnect(); socket.current = null;
    setEntered(false); setConnected(false); setAccount(null); setRanking([]); setPassword(''); setAuthError(''); setWhisperWindows([]); setRoomInvite(null);
  }
  async function copyRoomCode() {
    try { await navigator.clipboard.writeText(room!.code); notice('방 코드 6자리를 복사했습니다.'); }
    catch { notice(`방 코드: ${room!.code} · 복사 권한을 확인해주세요.`); }
  }
  async function copyInvite() {
    try { const url = new URL(location.href); url.search = ''; url.searchParams.set('room', room!.code); await navigator.clipboard.writeText(url.toString()); notice('초대 링크를 복사했습니다. 친구에게 보내주세요.'); }
    catch { notice(`방 코드: ${room!.code}`); }
  }
  const me = room?.players.find(p => p.id === identity);
  const outcome = room?.result?.winner == null ? 'draw' : me?.seat != null ? teamOf(me.seat) === room.result.winner ? 'win' : 'loss' : 'spectator';
  const resultTitle = outcome === 'win' ? '승리했습니다!' : outcome === 'loss' ? '패배했습니다' : outcome === 'draw' ? '무승부입니다' : `${(room?.result?.winner ?? 0) + 1}팀이 승리했습니다!`;
  const isHost = room?.hostId === identity;
  const current = room?.players.find(p => p.seat === room.currentSeat);
  const myTurn = room?.phase === 'playing' && me?.seat !== null && me?.seat === room.currentSeat && connected;
  const seconds = Math.max(0, Math.ceil(((room?.deadline ?? 0) - now - offset.current) / 1000));
  const timeRatio = room?.deadline ? Math.max(0, Math.min(1, (room.deadline - now - offset.current) / ((room.phase === 'rps' ? 10 : room.turnSeconds) * 1000))) : 0;
  const elapsed = room?.startedAt == null ? 0 : Math.max(0, Math.floor(((room.finishedAt ?? (now + offset.current)) - room.startedAt) / 1000));
  const elapsedLabel = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(n => String(n).padStart(2, '0')).join(':');
  const drawSeconds = Math.max(0, Math.ceil(((room?.drawOffer?.expiresAt ?? 0) - now - offset.current) / 1000));
  const rematchIsMine = room?.rematchOffer && me?.seat != null && teamOf(me.seat) === room.rematchOffer.team;
  const rematchLabel = !room?.rematchOffer ? '한판더 신청하기' : rematchIsMine ? '상대 팀 응답 대기 중' : '한판더 수락하기';
  const canChangeSeat = room && ['lobby', 'finished'].includes(room.phase);
  const canKick = Boolean(isHost && room && ['lobby', 'finished'].includes(room.phase));
  const timeWarning = Boolean(room?.deadline && seconds <= 5 && ['playing', 'rps'].includes(room.phase));
  const activePlayers = room?.players.filter(p => p.seat !== null) ?? [];
  const lobbyUsers = onlineUsers.filter(user => user.location === 'lobby' && user.id !== identity);
  const allReady = room && seatsFor(room.mode).every(s => activePlayers.some(p => p.seat === s && p.ready && p.connected));
  const currentColor = room?.blackTeam === (room?.currentSeat == null ? null : teamOf(room.currentSeat)) ? 'black' : 'white';
  const turnOrder = room?.blackTeam === 1 ? (room.mode === '2v2' ? [1, 0, 3, 2] : [1, 0]) : room?.mode === '2v2' ? [0, 1, 2, 3] : [0, 1];

  if (!entered) return <div className="welcome-page">
    <header className="welcome-header"><Brand /><span className="quiet">한 수, 그리고 우리 사이.</span></header>
    <main className="welcome-main">
      <section className="welcome-copy"><span className="eyebrow"><span className="live-dot" /> 함께 두는 온라인 오목</span><h1>좋은 한 수는,<br />함께할 때 <em>시작돼요.</em></h1><p>친구와 마주 앉아 한 판.<br />둘이서, 또는 넷이서. 돌 하나에 마음을 담아보세요.</p>
        <form className="nickname-form auth-form" onSubmit={enter}><div className="auth-tabs"><button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>로그인</button><button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>처음 계정 만들기</button></div><label htmlFor="nickname">닉네임</label><input id="nickname" autoFocus value={nickname} onChange={e => { setNickname(e.target.value); setAuthError(''); }} maxLength={12} autoComplete="username" placeholder="닉네임을 입력해주세요" required /><label htmlFor="password">비밀번호</label><div className="password-field"><Lock size={17} /><input id="password" type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthError(''); }} minLength={6} maxLength={72} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="6자 이상 입력해주세요" required /></div>{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="primary auth-submit" disabled={!nickname.trim() || password.length < 6 || authPending}>{authPending ? '확인 중…' : authMode === 'login' ? '로그인' : '계정 만들기'} <ArrowRight size={18} /></button><span className="quiet">닉네임 최대 12자 · 비밀번호 6~72자</span></form>
        <div className="welcome-features"><span><Users size={17} /> 1대1 & 2대2</span><span><MessageCircle size={17} /> 실시간 채팅</span><span><Eye size={17} /> 함께 관전</span></div>
      </section>
      <div className="welcome-art"><div className="art-caption"><span>LET’S PLAY, TOGETHER</span><span>01 — 15</span></div><div className="mini-board"><img src="/board.png" alt="첨부해주신 디자인의 15줄 오목판" />{[[7, 7, 'black'], [8, 7, 'white'], [6, 8, 'black'], [8, 6, 'white'], [5, 9, 'black']].map(([x, y, color], i) => <div className="art-stone" key={i} style={{ left: `${(77 + Number(x) * 48) / 822 * 100}%`, top: `${(77 + Number(y) * 48) / 822 * 100}%` }}><Stone color={color as 'black' | 'white'} /></div>)}</div><div className="art-note"><span className="live-dot" /> 작은 돌 하나, 새로운 대화 하나.</div></div>
    </main><footer className="welcome-footer">오목 <span>가볍게 만나, 즐겁게 한 판.</span></footer>
  </div>;

  return <div className="app">
    <header className="app-header"><Brand small onHome={() => void goHome()} /><div className="header-right"><button className="history-button" onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? "게임으로" : `대국 기록 (${records.length})`}</button><span className={`connection ${connected ? '' : 'offline'}`}><span className="live-dot" />{connected ? '실시간 연결' : '재연결 중'}</span><span className="profile-avatar">{nickname.slice(0, 1)}</span><span className="profile-name">{nickname}</span><button className="logout-button" onClick={() => void logout()}><LogOut size={15} /> 로그아웃</button></div></header>
    {!connected && <div className="connection-banner">연결을 다시 시도하고 있습니다. 20초 안에 재연결하면 기존 자리로 돌아옵니다. 대국 시간은 계속 흐릅니다.</div>}
    {historyOpen ? <HistoryPage records={records} onBack={() => setHistoryOpen(false)} /> : !room ? <main className="lobby-page">
      <div className="page-intro"><div><span className="eyebrow">THE LOBBY</span><h1>오늘은 누구와 둘까요?</h1><p>새로운 방을 만들거나, 친구의 방에 들어가세요.</p></div><button className="primary" onClick={() => setCreating(true)} disabled={!connected}><Plus size={18} /> 방 만들기</button></div>
      <section className="ranking-dashboard"><article className="my-record-card"><span className="eyebrow">MY RECORD</span><div className="record-owner"><span>{nickname.slice(0, 1)}</span><div><strong>{nickname}</strong><small>{account?.games ?? 0}전 · 승률 {account?.winRate ?? 0}%</small></div></div><div className="record-counts"><div><b>{account?.wins ?? 0}</b><span>승리</span></div><div><b>{account?.losses ?? 0}</b><span>패배</span></div><div><b>{account?.draws ?? 0}</b><span>무승부</span></div></div></article><article className="ranking-card"><div className="ranking-title"><div><Crown size={21} /><span><strong>승리 랭킹 TOP 10</strong><small>승리 횟수가 많은 순서</small></span></div><button onClick={() => void refreshAccount()}>새로고침</button></div>{ranking.length ? <ol>{ranking.map((player, index) => <li key={player.id} className={player.id === account?.id ? 'mine' : ''}><span className={`rank rank-${index + 1}`}>{index + 1}</span><strong>{player.nickname}{player.id === account?.id && <em>나</em>}</strong><span>{player.games}전 · {player.winRate}%</span><b>{player.wins}승</b></li>)}</ol> : <p className="ranking-empty">아직 기록된 대국이 없습니다. 첫 승리의 주인공이 되어보세요.</p>}</article></section>
      <section className="lobby-main-grid"><article className="lobby-chat-panel"><div className="lobby-panel-heading"><div><MessageCircle size={22} /><span><strong>로비 전체 채팅</strong><small>로비에 있는 플레이어들과 이야기해보세요.</small></span></div><b>{lobbyMessages.length}</b></div><div className="lobby-chat-messages">{lobbyMessages.length ? lobbyMessages.map(message => <div className={`lobby-chat-message ${message.nickname === nickname ? 'mine' : ''}`} key={message.id}><div><strong>{message.nickname}</strong><time>{new Date(message.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div><p>{message.text}</p></div>) : <div className="lobby-chat-empty"><MessageCircle size={28} /><strong>아직 대화가 없습니다</strong><span>먼저 인사를 건네보세요.</span></div>}<div ref={lobbyChatEnd} /></div><form className="lobby-chat-input" onSubmit={sendLobbyChat}><input aria-label="로비 전체 채팅 메시지" placeholder="전체 채팅에 메시지를 입력하세요" maxLength={200} value={lobbyChat} onChange={e => setLobbyChat(e.target.value)} /><button aria-label="로비 메시지 보내기" disabled={!lobbyChat.trim() || !connected}><Send size={20} /></button></form></article><section className="room-list lobby-room-column"><div className="section-heading"><h2>열려 있는 방 <span className="count">{rooms.length}</span></h2><span className="quiet"><Radio size={14} /> 실시간 업데이트</span></div>
        {rooms.length === 0 ? <div className="empty-rooms"><span className="empty-symbol"><Stone color="black" /><Stone color="white" /></span><h3>첫 번째 대국을 열어보세요</h3><p>아직 열린 방이 없어요.<br />친구를 초대하고 함께 시작해볼까요?</p><button className="secondary" onClick={() => setCreating(true)}>방 만들기 <ArrowRight size={16} /></button></div> : <div className="room-cards">{rooms.map(r => <article className="room-card" key={r.code}><div className="room-card-top"><div className="room-tags"><span className="mode-tag">{r.mode === '1v1' ? '1 : 1' : '2 : 2'}</span>{r.rules === 'renju' && <span className="renju-badge"><Shield size={14} />렌주 규칙 적용</span>}</div><span className={`status-tag ${r.phase === 'lobby' ? 'green' : ''}`}>{phaseLabel[r.phase]}</span></div><h3>{r.name}</h3><span className="room-code">#{r.code}{r.locked && <><Lock size={12} /> 비밀번호 방</>}</span><div className="room-card-bottom"><span><Users size={15} />{r.players}/{r.mode === '1v1' ? 2 : 4}<Eye size={15} />{r.spectators}/3</span><button className="text-button" onClick={() => r.locked ? setJoinPrompt({ code: r.code, spectator: r.phase !== 'lobby', roomName: r.name }) : void joinRoom(r.code, r.phase !== 'lobby')} disabled={pending || !connected}>{r.phase === 'lobby' ? '입장' : '관전'}<ArrowRight size={16} /></button></div></article>)}</div>}
      <div className="lobby-center-tools"><div className="invite-card"><span className="eyebrow">PLAY WITH FRIENDS</span><h2>친구가 기다리고 있나요?</h2><p>전달받은 6자리 방 코드를 입력하세요.</p><form onSubmit={e => { e.preventDefault(); void joinRoom(joinCode); }}><input aria-label="방 코드" placeholder="예: A1B2C3" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} /><button className="primary" disabled={joinCode.length !== 6 || pending || !connected}>방 입장하기 <ArrowRight size={16} /></button></form><button className="text-button spectator-join" disabled={joinCode.length !== 6 || pending || !connected} onClick={() => void joinRoom(joinCode, true)}><Eye size={15} /> 관전자로 입장</button></div><div className="rules-card"><h3>한 판의 약속</h3><p><span>01</span> 방마다 제한 시간 설정 · 시간 초과 시 팀 패배</p><p><span>02</span> 첫 판은 가위바위보 · 다음 판은 흑백 교대</p><p><span>03</span> 2대2는 팀을 번갈아 한 수씩</p><p><span>04</span> 방 생성 시 자유 오목 / 렌주 규칙 선택</p></div></div></section><aside className="online-panel"><div className="lobby-panel-heading"><div><Users size={22} /><span><strong>현재 접속자</strong><small>오목에 접속 중인 플레이어</small></span></div><b>{onlineUsers.length}</b></div><div className="online-user-list">{onlineUsers.map(user => <article className="online-user" key={user.id}><span className="online-avatar">{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}{user.id === account?.id && <em>나</em>}</strong><small>{user.games}전 · {user.wins}승 {user.losses}패 {user.draws}무 · 승률 {user.winRate}%</small></div><span className={`presence-status ${user.status}`}>{user.status === 'playing' ? '플레이중' : '대기중'}</span></article>)}</div></aside></section>
    </main> : <main className="game-page">
      <div className="room-heading"><div><button className="back-button" onClick={() => ['rps', 'playing'].includes(room.phase) && me?.seat !== null ? setConfirm('leave') : void send('leave')}><ArrowLeft size={16} /> 로비로</button><h1>{room.name} <span className="mode-tag">{room.mode === '1v1' ? '1 : 1' : '2 : 2'}</span>{room.locked && <span className="locked-room-badge"><Lock size={14} />비밀번호 방</span>}{room.rules === 'renju' && <span className="renju-badge"><Shield size={16} />렌주 규칙 적용</span>}</h1></div><div className="room-share"><div className="match-clock" aria-label="대국 경과 시간"><span>플레이 시간</span><strong>{elapsedLabel}</strong></div><button className="invite-button" aria-label="방 코드 복사" onClick={() => void copyRoomCode()}><span>방 코드</span><strong>{room.code}</strong><Copy size={16} /></button><button className="invite-button" onClick={() => void copyInvite()}>초대 링크 복사 <Copy size={16} /></button></div></div>
      <div className="game-layout">
        <aside className="chat-panel"><div className="chat-heading"><h2><MessageCircle size={17} /> 함께 나누는 대화</h2><span>{room.players.length}</span></div><div className="chat-messages">{room.chat.map(m => m.system ? <div className="system-message" key={m.id}>{m.text}</div> : <div className={`chat-message ${m.nickname === nickname ? 'mine' : ''}`} key={m.id}><div className="chat-meta"><strong>{m.nickname}</strong><time>{new Date(m.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div><div className="chat-bubble">{m.text}</div></div>)}<div ref={chatEnd} /></div><form className="chat-input" onSubmit={sendChat}><input aria-label="채팅 메시지" placeholder="대화를 나눠보세요" maxLength={200} value={chat} onChange={e => setChat(e.target.value)} /><button aria-label="메시지 보내기" disabled={!chat.trim() || !connected}><Send size={18} /></button></form><span className="chat-hint">좋은 한 수만큼, 따뜻한 한마디.</span></aside>
        <section className="board-panel"><div className={`turn-announcement ${myTurn ? "is-mine" : ""}`} role="status">{room.phase === "playing" ? <><span>{room.currentSeat! + 1}번 · {teamOf(room.currentSeat!) + 1}팀</span><strong>{current?.nickname}님의 차례</strong><b>{myTurn ? "내 차례! 돌을 놓아주세요" : "상대 플레이어가 돌을 놓고 있어요"}</b></> : <strong className={room.phase === 'finished' ? `finished-title ${outcome}` : undefined}>{room.phase === 'finished' ? resultTitle : phaseLabel[room.phase]}</strong>}</div><div className="board-status"><div><span className={`status-dot ${myTurn ? 'green' : ''}`} /><strong>{room.phase === 'lobby' ? '플레이어를 기다리고 있어요' : room.phase === 'rps' ? '흑돌을 정하고 있어요' : room.phase === 'finished' ? '대국이 끝났어요' : myTurn ? '당신의 차례예요' : `${current?.nickname ?? '상대'}님의 차례`}</strong>{room.phase === 'playing' && <Stone color={currentColor} small />}</div><div className={`timer-block ${timeWarning ? 'time-warning' : ''}`}><span className={`timer ${seconds <= 10 && room.phase === 'playing' ? 'urgent' : ''}`}>{room.deadline ? <><span>{seconds.toString().padStart(2, '0')}</span> 초</> : '15 × 15'}</span>{room.deadline && <div className={`time-track ${seconds <= 10 && room.phase === 'playing' ? 'urgent' : ''}`} role="progressbar" aria-label="남은 제한 시간" aria-valuemin={0} aria-valuemax={room.phase === 'rps' ? 10 : room.turnSeconds} aria-valuenow={seconds}><div style={{ transform: `scaleX(${timeRatio})` }} /></div>}</div></div>
          <div className={`board-wrap ${myTurn ? 'my-turn' : ''} ${room.phase === 'playing' && timeWarning ? 'board-time-warning' : ''}`}><img className="board-image" src="/board.png" alt="15 × 15 오목판" draggable={false} /><div className="board-grid" role="grid" aria-label="오목판" onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); setHover([Math.max(0, Math.min(14, Math.floor((e.clientX - rect.left) / rect.width * 15))), Math.max(0, Math.min(14, Math.floor((e.clientY - rect.top) / rect.height * 15)))]); }} onPointerLeave={() => setHover(null)}>{room.board.flatMap((row, y) => row.map((cell, x) => { const forbidden = room.forbiddenMoves?.find(p => p.x === x && p.y === y); const last = room.moves.at(-1); const winning = room.winningLine.some(([wx, wy]) => wx === x && wy === y); return <button key={`${x}-${y}`} role="gridcell" aria-label={`${String.fromCharCode(65 + x)}${15 - y}${cell ? cell === 1 ? ' 흑돌' : ' 백돌' : ' 빈자리'}${forbidden ? ` 금수 ${forbidden.reason}` : ''}`} title={forbidden ? `렌주 금수: ${forbidden.reason}` : undefined} className={`board-cell ${winning ? 'winning' : ''}`} disabled={!myTurn || !!cell || !!forbidden || pending} onClick={() => void send('move', { x, y })}>{cell ? <><Stone color={cell === 1 ? 'black' : 'white'} />{last?.x === x && last?.y === y && <span className="last-marker" />}</> : forbidden ? <span className="forbidden-marker" aria-hidden="true">×</span> : myTurn && hover?.[0] === x && hover?.[1] === y ? <span className="preview-stone"><Stone color={currentColor} /></span> : null}</button>; }))}</div>
          {room.phase === 'playing' && room.rpsResult && rpsReveal && <div className="rps-result-banner" role="status"><button aria-label="가위바위보 결과 닫기" onClick={() => setRpsReveal(false)}><X size={16} /></button><span>가위바위보 결과</span><h2>{room.rpsResult.winner + 1}팀 승리!</h2><div className="rps-result-choices">{room.rpsResult.choices.map((choice, team) => <div key={team}><strong>{team + 1}팀 · {room.players.find(p => p.seat === team)?.nickname}</strong><span>{gestures.find(g => g.value === choice)?.symbol ?? '⌛'} {gestures.find(g => g.value === choice)?.label ?? '미선택'}</span></div>)}</div><p><b>{room.rpsResult.winner + 1}팀이 흑돌</b>로 선공 · {2 - room.rpsResult.winner}팀은 백돌로 후공</p></div>}
          {room.phase === 'lobby' && <div className="board-overlay"><div className="waiting-card"><span className="waiting-stones"><Stone color="black" /><Stone color="white" /></span><h2>한 판, 함께 준비해요</h2><p>오른쪽에서 팀과 자리를 선택하고<br />준비 완료 버튼을 눌러주세요.{room.blackTeam !== null && <><br />흑백 교대 · 가위바위보 없이 시작합니다.</>}</p><div className="waiting-progress">{activePlayers.filter(p => p.ready).length}<span> / {room.mode === '1v1' ? 2 : 4}명 준비 완료</span></div></div></div>}
          {room.phase === 'rps' && <div className="board-overlay"><div className="rps-card"><span className="eyebrow">FIRST MOVE</span><h2>가위, 바위, 보!</h2><p className={room.rpsRetryReason ? "rps-retry-notice" : undefined} role={room.rpsRetryReason ? "status" : undefined}>{room.rpsRetryReason === 'tie' ? '무승부입니다! 다시 선택해주세요.' : room.rpsRetryReason === 'missing' ? '두 팀 모두 미선택! 다시 선택해주세요.' : '이긴 팀이 흑돌로 먼저 시작해요.'}</p><div className="rps-count">{seconds}</div><div className="rps-choices">{gestures.map(g => <button key={g.value} disabled={!connected || pending || (me?.seat !== 0 && me?.seat !== 1) || room.rpsSelected[me?.seat ?? 0]} onClick={() => void send('rps', { gesture: g.value })}><span>{g.symbol}</span>{g.label}</button>)}</div><div className="rps-team-status">{[0, 1].map(t => <span key={t}>{t + 1}팀 {room.rpsSelected[t] ? '선택 완료 ✓' : '선택 중…'}</span>)}</div><span className="quiet">{me?.seat !== 0 && me?.seat !== 1 ? '팀의 첫 번째 플레이어가 선택합니다.' : '선택은 상대에게 공개되지 않아요.'}</span><span className="rps-round">ROUND {room.rpsRound}</span></div></div>}
          {room.phase === 'finished' && resultReveal && <div className={`match-result-overlay ${outcome}`}><div className={`result-banner match-result ${outcome}`} role="status" aria-live="polite"><button className="result-close" aria-label="대국 결과창 닫기" onClick={() => setResultReveal(false)}><X size={20} /></button><div className="result-emblem" aria-hidden="true">{outcome === 'loss' ? <Flag size={40} /> : outcome === 'draw' ? <Shield size={40} /> : <Trophy size={40} />}</div><span className="eyebrow">{outcome === 'win' ? 'VICTORY' : outcome === 'loss' ? 'DEFEAT' : outcome === 'draw' ? 'DRAW' : 'GAME OVER'}</span><h2>{resultTitle}</h2>{room.result?.winner != null && <strong className="result-team">{room.result.winner + 1}팀 승리 · {2 - room.result.winner}팀 패배</strong>}<p>{room.result?.reason}</p>{me?.seat != null ? <button className="primary" disabled={pending || !connected || Boolean(rematchIsMine)} onClick={() => void send('rematch')}>{rematchLabel} {!rematchIsMine && <ArrowRight size={16} />}</button> : <span className="quiet">플레이어가 다음 대국을 신청할 때까지 기다려주세요.</span>}</div></div>}
          </div><div className="board-footer">{room.phase === 'finished' && <button className="result-reopen" onClick={() => setResultReveal(true)}>대국 결과 보기</button>}<span>{room.moves.length.toString().padStart(2, '0')}번째 수 <span className="footer-divider">/</span> {room.rules === 'renju' ? '흑 5개 · 백 5개 이상 승리' : '5개 이상 연결하면 승리'}</span>{room.rules === 'renju' && <span className="renju-footer-rule">흑 삼삼·사사·장목 금지</span>}</div>
          <div className="turn-sequence"><span>착수 순서</span>{turnOrder.map((seat, i) => <div key={seat} className={room.currentSeat === seat && room.phase === 'playing' ? 'active' : ''}><span className={`seat-dot team-${teamOf(seat)}`}>{seat + 1}</span><span>{room.players.find(p => p.seat === seat)?.nickname ?? '대기'}</span>{i < turnOrder.length - 1 && <ChevronRight size={12} />}</div>)}</div>
        </section>
        <aside className="players-panel">{[0, 1].map(team => <div className={`team-card team-${team}`} key={team}><div className="team-heading"><h2><span className="team-indicator" />{team + 1}팀</h2>{room.blackTeam !== null ? <span className="team-color"><Stone color={room.blackTeam === team ? 'black' : 'white'} small />{room.blackTeam === team ? '흑돌' : '백돌'}</span> : <span className="quiet">{team === 0 ? '플레이어 1' : '플레이어 2'}{room.mode === '2v2' ? ` · ${team === 0 ? 3 : 4}` : ''}</span>}</div>{seatsFor(room.mode).filter(s => teamOf(s) === team).map(seat => { const p = room.players.find(p => p.seat === seat); return <Seat key={seat} player={p} seat={seat} mine={p?.id === identity} host={p?.id === room.hostId} active={room.phase === 'playing' && room.currentSeat === seat} showReady={room.phase === 'lobby'} canJoin={Boolean(canChangeSeat && connected && !pending)} onJoin={() => void send('seat', { seat })} onKick={canKick && p && p.id !== identity ? () => setKickTarget({ id: p.id, nickname: p.nickname }) : undefined} />; })}</div>)}
          <div className="spectator-card"><div className="section-heading"><h3><Eye size={16} /> 관전석</h3><span className="quiet">{room.players.filter(p => p.seat === null).length} / 3</span></div>{room.players.filter(p => p.seat === null).map(p => <div className="spectator" key={p.id}><span className="small-avatar">{p.nickname.slice(0, 1)}</span><span className="spectator-name">{p.nickname}{p.id === identity && <span className="me-tag">나</span>}{!p.connected && <span className="quiet">재연결 중</span>}</span>{canKick && p.id !== identity && <button className="kick-button compact" aria-label={`${p.nickname} 추방`} onClick={() => setKickTarget({ id: p.id, nickname: p.nickname })}><UserMinus size={14} /></button>}</div>)}{canChangeSeat && me?.seat !== null && <button className="spectator-button" disabled={pending || !connected || room.players.filter(p => p.seat === null).length >= 3} onClick={() => void send('seat', { seat: null })}><Plus size={14} /> 관전석으로 이동</button>}{room.players.filter(p => p.seat === null).length === 0 && <p className="quiet spectator-empty">함께 지켜볼 친구를 초대해보세요.</p>}</div>
          {room.phase === 'lobby' && <div className="ready-actions">{me?.seat !== null && <button className={`ready-button ${me?.ready ? 'is-ready' : ''}`} disabled={pending || !connected} onClick={() => void send('ready')}><Check size={18} />{me?.ready ? '준비 완료 · 취소하기' : '준비 완료'}</button>}{isHost && <button className="primary" disabled={!allReady || pending || !connected} onClick={() => void send('start')}>대국 시작 <ArrowRight size={17} /></button>}<p>{isHost ? '모두 준비되면 대국을 시작할 수 있어요.' : '모두 준비되면 방장이 대국을 시작해요.'}</p></div>}
          {me?.seat != null && ['rps', 'playing'].includes(room.phase) && <div className="match-actions"><button className="resign-button" onClick={() => setConfirm('resign')} disabled={pending || !connected}><Flag size={15} /> 기권하기</button>{room.phase === 'playing' && <button className="draw-button" disabled={pending || !connected || !!room.drawOffer} onClick={() => void send('drawOffer')}>무승부 신청</button>}</div>}
          {me?.seat != null && room.phase === 'finished' && <div className="match-actions"><button className="rematch-button" disabled={pending || !connected || Boolean(rematchIsMine)} onClick={() => void send('rematch')}>{rematchLabel} {!rematchIsMine && <ArrowRight size={17} />}</button>{room.rematchOffer && <div className="rematch-offer" role="status"><strong>{room.rematchOffer.nickname}님의 한판더 신청</strong><p>{rematchIsMine ? '상대 팀의 수락을 기다리고 있어요.' : '수락하면 준비 화면으로 이동합니다.'}</p></div>}</div>}
          {room.drawOffer && room.phase === 'playing' && <div className="draw-offer" role="status"><strong>{room.drawOffer.team + 1}팀 무승부 신청</strong><p>{room.drawOffer.nickname}님이 신청했습니다.</p><b>{drawSeconds}초 안에 응답</b>{me?.seat != null && teamOf(me.seat) !== room.drawOffer.team ? <div><button disabled={pending || !connected || drawSeconds === 0} onClick={() => void send('drawAnswer', { accept: true })}>수락</button><button disabled={pending || !connected || drawSeconds === 0} onClick={() => void send('drawAnswer', { accept: false })}>거절</button></div> : <p>상대 팀의 수락을 기다리고 있어요.</p>}<small>착수 제한 시간은 계속 흐릅니다.</small></div>}
          {room.rules === 'renju' && <div className="renju-rule-panel"><strong><Shield size={20} />렌주 규칙 적용</strong><p>흑돌은 삼삼·사사·장목 금지<br />금수 자리는 반투명 X로 표시됩니다.</p></div>}<div className="room-notes"><Shield size={16} /><p>한 수에 {room.turnSeconds}초<br /><span>시간을 넘기면 해당 팀이 패배해요.</span></p></div>
        </aside>
      </div>
    </main>}
    {room && !historyOpen && <aside className={`room-lobby-directory ${directoryMinimized ? 'minimized' : ''}`}><button className="room-directory-heading" onClick={() => setDirectoryMinimized(value => !value)} aria-expanded={!directoryMinimized}><span><Users size={19} /><span><strong>로비 접속자</strong><small>초대하거나 귓속말을 보내세요</small></span></span><b>{lobbyUsers.length}</b>{directoryMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{!directoryMinimized && <div className="room-directory-list">{lobbyUsers.length ? lobbyUsers.map(user => <article key={user.id}><span className="online-avatar">{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}</strong><small>{user.games}전 · {user.wins}승 {user.losses}패 · 승률 {user.winRate}%</small></div><div className="directory-actions"><button className="invite-user-button" onClick={() => void inviteUser(user)}><UserPlus size={14} />초대</button><button className="whisper-user-button" onClick={() => void openWhisper(user)}><MessageSquare size={14} />귓속말</button></div></article>) : <div className="directory-empty"><Users size={25} /><strong>로비에 대기 중인 사람이 없어요</strong><span>접속자가 로비로 돌아오면 여기에 표시됩니다.</span></div>}</div>}</aside>}
    {whisperWindows.length > 0 && <div className={`whisper-stack ${room ? 'with-directory' : ''}`}>{whisperWindows.map(window => <section className={`whisper-window ${window.minimized ? 'minimized' : ''}`} key={window.peerId}><header><button className="whisper-title" onClick={() => setWhisperWindows(previous => previous.map(item => item.peerId === window.peerId ? { ...item, minimized: !item.minimized } : item))}><span className="live-dot" /><strong>{window.nickname}</strong><small>1대1 귓속말</small></button><button aria-label={window.minimized ? '귓속말 펼치기' : '귓속말 최소화'} onClick={() => setWhisperWindows(previous => previous.map(item => item.peerId === window.peerId ? { ...item, minimized: !item.minimized } : item))}>{window.minimized ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button><button aria-label="귓속말 나가기" title="채팅방 나가기" onClick={() => closeWhisper(window.peerId)}><X size={17} /></button></header>{!window.minimized && <><div className="whisper-messages">{window.messages.length ? window.messages.map(message => message.system ? <p className="whisper-system" key={message.id}>{message.text}</p> : <div className={`whisper-message ${message.senderId === identity ? 'mine' : ''}`} key={message.id}><span>{message.nickname}</span><p>{message.text}</p></div>) : <div className="whisper-empty">둘만의 대화를 시작해보세요.</div>}</div><form onSubmit={e => sendWhisper(e, window.peerId)}><input aria-label={`${window.nickname}님에게 귓속말`} maxLength={200} value={window.draft} disabled={window.closed} placeholder={window.closed ? '상대방이 채팅방을 나갔습니다.' : '메시지를 입력하세요'} onChange={e => setWhisperWindows(previous => previous.map(item => item.peerId === window.peerId ? { ...item, draft: e.target.value } : item))} /><button aria-label="귓속말 보내기" disabled={window.closed || !window.draft.trim() || !connected}><Send size={17} /></button></form></>}</section>)}</div>}
    <footer className="app-footer"><span>한 수, 그리고 우리 사이.</span><span>오목 © 2026</span></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="알림 닫기" onClick={() => setToast('')}><X size={15} /></button></div>}
    {roomInvite && !room && <div className="modal-backdrop"><div className="modal invite-notice-modal"><span className="invite-notice-icon"><UserPlus size={28} /></span><span className="eyebrow">ROOM INVITATION</span><h2>방 초대가 도착했어요</h2><strong>{roomInvite.from}님이 초대했습니다.</strong><p>{roomInvite.roomName} · #{roomInvite.roomCode}{roomInvite.locked && <><br /><Lock size={14} /> 비밀번호가 필요한 방</>}</p><div><button className="secondary" onClick={() => setRoomInvite(null)}>거절</button><button className="primary" onClick={() => roomInvite.locked ? (setJoinPrompt({ code: roomInvite.roomCode, spectator: false, roomName: roomInvite.roomName }), setRoomInvite(null)) : void joinRoom(roomInvite.roomCode)}>입장하기 <ArrowRight size={16} /></button></div></div></div>}
    {joinPrompt && !room && <div className="modal-backdrop"><form className="modal room-password-modal" onSubmit={async e => { e.preventDefault(); await joinRoom(joinPrompt.code, joinPrompt.spectator, joinPassword); }}><button className="modal-close" type="button" aria-label="닫기" onClick={() => { setJoinPrompt(null); setJoinPassword(''); setJoinError(''); }}><X size={20} /></button><span className="password-modal-icon"><Lock size={24} /></span><span className="eyebrow">PRIVATE ROOM</span><h2>방 비밀번호를 입력해주세요</h2><p>{joinPrompt.roomName ?? `방 코드 #${joinPrompt.code}`}</p><label htmlFor="join-room-password">방 비밀번호</label><input id="join-room-password" type="password" minLength={4} maxLength={20} autoFocus value={joinPassword} onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }} placeholder="4~20자" required />{joinError && <p className="auth-error" role="alert">{joinError}</p>}<button className="primary" disabled={joinPassword.length < 4 || pending || !connected}>{pending ? '확인 중…' : joinPrompt.spectator ? '관전자로 입장' : '방 입장하기'} <ArrowRight size={16} /></button></form></div>}
    {kickNotice && <div className="modal-backdrop"><div className="modal kicked-modal"><span className="kicked-icon"><UserMinus size={29} /></span><span className="eyebrow">ROOM NOTICE</span><h2>추방당했습니다</h2><p>{kickNotice}<br />이 방에는 다시 입장할 수 있습니다.</p><button className="primary" onClick={() => setKickNotice('')}>로비 확인</button></div></div>}
    {creating && <div className="modal-backdrop"><form className="modal" onSubmit={async e => { e.preventDefault(); if (await send('create', { name: roomName, mode, rules, turnSeconds, password: roomPassword })) { setCreating(false); setRoomPassword(''); } }}><button className="modal-close" type="button" aria-label="닫기" onClick={() => setCreating(false)}><X size={20} /></button><span className="eyebrow">NEW ROOM</span><h2>우리의 대국을 시작해요</h2><label htmlFor="room-name">방 이름</label><input id="room-name" value={roomName} maxLength={30} onChange={e => setRoomName(e.target.value)} required autoFocus /><label>대국 방식</label><div className="mode-options">{(['1v1', '2v2'] as Mode[]).map(m => <button className={mode === m ? 'selected' : ''} type="button" key={m} onClick={() => setMode(m)}><Users size={22} /><strong>{m === '1v1' ? '1 대 1' : '2 대 2'}</strong><span>{m === '1v1' ? '마주 앉아 한 수씩' : '두 명이 한 팀으로'}</span></button>)}</div><label>오목 규칙</label><div className="rule-options">{(['freestyle', 'renju'] as RuleSet[]).map(r => <button type="button" key={r} aria-pressed={rules === r} className={rules === r ? 'selected' : ''} onClick={() => setRules(r)}><strong>{r === 'renju' ? '렌주 규칙' : '자유 오목'}</strong><span>{r === 'renju' ? '흑 삼삼·사사·장목 금지' : '금수 없이 5개 이상 연결'}</span></button>)}</div><label htmlFor="room-password">방 비밀번호 <span className="optional-label">선택</span></label><div className="password-field room-password-field"><Lock size={17} /><input id="room-password" type="password" minLength={4} maxLength={20} value={roomPassword} onChange={e => setRoomPassword(e.target.value)} autoComplete="new-password" placeholder="비워두면 누구나 입장할 수 있어요" /></div><span className="room-password-hint">설정하면 선수와 관전자 모두 비밀번호를 입력해야 합니다.</span><label htmlFor="turn-seconds">돌 놓는 제한 시간 (초)</label><div className="time-options">{[2, 10, 15, 30, 60, 120].map(t => <button type="button" key={t} className={turnSeconds === t ? "selected" : ""} onClick={() => setTurnSeconds(t)}>{t}초</button>)}</div><input id="turn-seconds" type="number" min={2} max={300} step={1} value={turnSeconds || ""} onChange={e => setTurnSeconds(Number(e.target.value))} required /><p className="quiet">2~300초 · 두 모드 모두 적용 · 시간 초과 시 팀 패배<br />관전자 3명 · 첫 판 가위바위보 10초 · 다음 판부터 흑백 교대</p><button className="primary" disabled={!roomName.trim() || (roomPassword.length > 0 && roomPassword.length < 4) || pending || !connected}>방 만들기 <ArrowRight size={17} /></button></form></div>}
    {kickTarget && <div className="modal-backdrop"><div className="modal confirm-modal"><h2>{kickTarget.nickname}님을 추방할까요?</h2><p>해당 사용자는 로비로 이동합니다. 이후 다시 방에 입장할 수 있습니다.</p><div><button className="secondary" onClick={() => setKickTarget(null)}>취소</button><button className="danger" disabled={pending} onClick={async () => { if (await send('kick', { targetId: kickTarget.id })) setKickTarget(null); }}>추방하기</button></div></div></div>}
    {confirm && <div className="modal-backdrop"><div className="modal confirm-modal"><h2>{confirm === 'resign' ? '기권하시겠어요?' : confirm === 'home' ? '메인 페이지로 돌아갈까요?' : '방을 나가시겠어요?'}</h2><p>대국 중 기권하거나 퇴장하면 우리 팀이 패배합니다.</p><div><button className="secondary" onClick={() => setConfirm(null)}>계속 플레이</button><button className="danger" disabled={pending} onClick={async () => { if (confirm === 'home') await goHome(); else if (await send(confirm)) setConfirm(null); }}>{confirm === 'resign' ? '기권하기' : confirm === 'home' ? '메인으로 이동' : '나가기'}</button></div></div></div>}
  </div>;
}

function Seat({ player, seat, mine, host, active, showReady, canJoin, onJoin, onKick }: { player?: Player; seat: number; mine: boolean; host: boolean; active: boolean; showReady: boolean; canJoin: boolean; onJoin: () => void; onKick?: () => void }) {
  return player ? <div className={`player-seat ${active ? 'active' : ''}`}><div className={`player-avatar team-${teamOf(seat)}`}>{player.nickname.slice(0, 1)}<span>{seat + 1}</span></div><div className="player-detail"><strong>{player.nickname}{mine && <span className="me-tag">나</span>}</strong><span>{!player.connected ? '재연결 중…' : active ? '지금 두는 중' : showReady ? player.ready ? '준비 완료' : '대기 중' : '차례 대기'}{host && ' · 방장'}</span></div>{showReady && player.ready && player.connected && <Check className="ready-check" size={16} />}{onKick && <button className="kick-button" aria-label={`${player.nickname} 추방`} title="방에서 추방" onClick={onKick}><UserMinus size={14} /></button>}</div> : <button className="empty-seat" disabled={!canJoin} onClick={onJoin}><span><Plus size={18} /></span><div><strong>빈 자리</strong><small>플레이어 {seat + 1}로 참가</small></div></button>;
}

function HistoryPage({ records, onBack }: { records: RoomState[]; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.gameId ?? null);
  const [step, setStep] = useState(records[0]?.moves.length ?? 0);
  const selected = records.find(r => r.gameId === selectedId) ?? records[0];
  const board = Array.from({ length: 15 }, () => Array<number>(15).fill(0));
  const shown = selected?.moves.slice(0, step) ?? [];
  for (const move of shown) board[move.y][move.x] = move.color;
  const last = shown.at(-1);
  const outcome = (record: RoomState) => record.result?.winner == null ? '무승부' : `${record.result.winner + 1}팀 승리`;
  return <main className="history-page">
    <div className="page-intro"><div><span className="eyebrow">MATCH HISTORY</span><h1>지난 대국 기록</h1><p>접속 중 끝난 대국을 한 수씩 다시 볼 수 있어요. 사이트를 떠나거나 새로고침하면 기록은 사라집니다.</p></div><button className="secondary" onClick={onBack}><ArrowLeft size={16} /> 게임으로 돌아가기</button></div>
    {!selected ? <div className="empty-rooms"><h3>아직 끝난 대국이 없어요</h3><p>대국이 끝나면 이곳에 자동으로 기록됩니다.</p></div> : <div className="history-layout">
      <aside className="history-list">{records.map(record => <button key={record.gameId} className={selected.gameId === record.gameId ? 'selected' : ''} onClick={() => { setSelectedId(record.gameId); setStep(record.moves.length); }}><strong>{record.name}</strong><span>{outcome(record)} · {record.mode === '1v1' ? '1대1' : '2대2'} · {record.moves.length}수</span><time>{new Date(record.serverTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></button>)}</aside>
      <section className="history-detail"><h2>{selected.name} · {outcome(selected)}</h2><p>{selected.result?.reason}</p><div className="history-teams">{[0, 1].map(team => <div key={team}><strong>{team + 1}팀 {selected.blackTeam === null ? '' : selected.blackTeam === team ? '흑돌' : '백돌'}</strong><span>{selected.players.filter(p => p.seat !== null && teamOf(p.seat) === team).map(p => p.nickname).join(' · ')}</span></div>)}</div>
        <div className="board-wrap history-board"><img className="board-image" src="/board.png" alt="지난 대국 오목판" /><div className="board-grid">{board.flatMap((row, y) => row.map((cell, x) => <div className="board-cell" key={`${x}-${y}`}>{cell ? <><Stone color={cell === 1 ? 'black' : 'white'} />{last?.x === x && last?.y === y && <span className="last-marker" />}</> : null}</div>))}</div></div>
        <div className="replay-controls"><button className="secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}>이전 수</button><strong>{step} / {selected.moves.length}수</strong><button className="secondary" disabled={step >= selected.moves.length} onClick={() => setStep(s => s + 1)}>다음 수</button><button className="secondary" onClick={() => setStep(selected.moves.length)}>최종 상태</button></div><input aria-label="다시 볼 착수 순서" type="range" min={0} max={selected.moves.length} value={step} onChange={e => setStep(Number(e.target.value))} />
        <p>{last ? `${selected.players.find(p => p.id === last.playerId)?.nickname ?? '플레이어'} · ${String.fromCharCode(65 + last.x)}${15 - last.y} 착수` : '첫 수를 놓기 전입니다.'}</p>
      </section>
    </div>}
  </main>;
}
