import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Eye, Flag, MessageCircle, Plus, Radio, Send, Shield, Users, X } from 'lucide-react';
import { type ChatMessage, type Gesture, type Mode, type Player, type Reply, type RoomState, type RoomSummary, seatsFor, teamOf } from './shared';

const phaseLabel = { lobby: '대기 중', rps: '가위바위보', playing: '대국 중', finished: '대국 종료' };
const gestures: { value: Gesture; label: string; symbol: string }[] = [{ value: 'scissors', label: '가위', symbol: '✌️' }, { value: 'rock', label: '바위', symbol: '✊' }, { value: 'paper', label: '보', symbol: '🖐️' }];
const invitedCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark"><i /><i /></span><span>오목<span className="brand-light"> 사이</span></span></div>;
}
function Stone({ color, small = false }: { color: 'black' | 'white'; small?: boolean }) { return <span className={`stone ${color} ${small ? 'tiny' : ''}`} />; }

export default function App() {
  const [nickname, setNickname] = useState(sessionStorage.getItem('gomoku-nickname') ?? '');
  const [entered, setEntered] = useState(false);
  const [connected, setConnected] = useState(false);
  const [identity, setIdentity] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [mode, setMode] = useState<Mode>('1v1');
  const [roomName, setRoomName] = useState('함께 한 판');
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [joinCode, setJoinCode] = useState(invitedCode);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'resign' | null>(null);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const socket = useRef<Socket | null>(null);
  const [chat, setChat] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);

  function notice(text: string) { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); }
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, []);
  useEffect(() => { const messages = chatEnd.current?.parentElement; if (messages) messages.scrollTop = messages.scrollHeight; }, [room?.chat.at(-1)?.id]);
  useEffect(() => {
    if (!entered) return;
    let token = sessionStorage.getItem('gomoku-token');
    if (!token) {
      // getRandomValues also works on LAN HTTP, where randomUUID is unavailable.
      const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      token = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      sessionStorage.setItem('gomoku-token', token);
    }
    const s = io({ auth: { token, nickname }, reconnectionDelay: 500, reconnectionDelayMax: 2000 }); socket.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => { setConnected(false); setPending(false); });
    s.on('connect_error', e => { setConnected(false); notice(e.message === 'xhr poll error' ? '서버에 연결할 수 없습니다. 연결을 다시 시도합니다.' : e.message); });
    s.on('identity', ({ id, nickname: name }: { id: string; nickname: string }) => { setIdentity(id); setNickname(name); });
    s.on('rooms', setRooms);
    s.on('chat', (message: ChatMessage) => setRoom(r => r ? { ...r, chat: [...r.chat, message].slice(-100) } : r));
    s.on('roomClosed', () => notice('모든 플레이어가 퇴장하여 방이 닫혔습니다.'));
    s.on('room', (r: RoomState | null) => { if (r) offset.current = r.serverTime - Date.now(); setRoom(r); setHover(null); });
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
  function enter(e: FormEvent) { e.preventDefault(); if (!nickname.trim()) return; sessionStorage.setItem('gomoku-nickname', nickname.trim()); setNickname(nickname.trim()); setEntered(true); }
  async function copyInvite() {
    try { const url = new URL(location.href); url.search = ''; url.searchParams.set('room', room!.code); await navigator.clipboard.writeText(url.toString()); notice('초대 링크를 복사했습니다. 친구에게 보내주세요.'); }
    catch { notice(`방 코드: ${room!.code}`); }
  }
  const me = room?.players.find(p => p.id === identity);
  const isHost = room?.hostId === identity;
  const current = room?.players.find(p => p.seat === room.currentSeat);
  const myTurn = room?.phase === 'playing' && me?.seat !== null && me?.seat === room.currentSeat && connected;
  const seconds = Math.max(0, Math.ceil(((room?.deadline ?? 0) - now - offset.current) / 1000));
  const timeRatio = room?.deadline ? Math.max(0, Math.min(1, (room.deadline - now - offset.current) / ((room.phase === 'rps' ? 3 : room.turnSeconds) * 1000))) : 0;
  const activePlayers = room?.players.filter(p => p.seat !== null) ?? [];
  const allReady = room && seatsFor(room.mode).every(s => activePlayers.some(p => p.seat === s && p.ready && p.connected));
  const currentColor = room?.blackTeam === (room?.currentSeat == null ? null : teamOf(room.currentSeat)) ? 'black' : 'white';
  const turnOrder = room?.blackTeam === 1 ? (room.mode === '2v2' ? [1, 0, 3, 2] : [1, 0]) : room?.mode === '2v2' ? [0, 1, 2, 3] : [0, 1];

  if (!entered) return <div className="welcome-page">
    <header className="welcome-header"><Brand /><span className="quiet">한 수, 그리고 우리 사이.</span></header>
    <main className="welcome-main">
      <section className="welcome-copy"><span className="eyebrow"><span className="live-dot" /> 함께 두는 온라인 오목</span><h1>좋은 한 수는,<br />함께할 때 <em>시작돼요.</em></h1><p>친구와 마주 앉아 한 판.<br />둘이서, 또는 넷이서. 돌 하나에 마음을 담아보세요.</p>
        <form className="nickname-form" onSubmit={enter}><label htmlFor="nickname">어떤 이름으로 만날까요?</label><div className="input-action"><input id="nickname" autoFocus value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12} placeholder="닉네임을 입력해주세요" required /><button className="primary" disabled={!nickname.trim()}>시작하기 <ArrowRight size={18} /></button></div><span className="quiet">최대 12자 · 가입 없이 바로 플레이</span></form>
        <div className="welcome-features"><span><Users size={17} /> 1대1 & 2대2</span><span><MessageCircle size={17} /> 실시간 채팅</span><span><Eye size={17} /> 함께 관전</span></div>
      </section>
      <div className="welcome-art"><div className="art-caption"><span>LET’S PLAY, TOGETHER</span><span>01 — 15</span></div><div className="mini-board"><img src="/board.png" alt="첨부해주신 디자인의 15줄 오목판" />{[[7, 7, 'black'], [8, 7, 'white'], [6, 8, 'black'], [8, 6, 'white'], [5, 9, 'black']].map(([x, y, color], i) => <div className="art-stone" key={i} style={{ left: `${(77 + Number(x) * 48) / 822 * 100}%`, top: `${(77 + Number(y) * 48) / 822 * 100}%` }}><Stone color={color as 'black' | 'white'} /></div>)}</div><div className="art-note"><span className="live-dot" /> 작은 돌 하나, 새로운 대화 하나.</div></div>
    </main><footer className="welcome-footer">오목 사이 <span>가볍게 만나, 즐겁게 한 판.</span></footer>
  </div>;

  return <div className="app">
    <header className="app-header"><Brand small /><div className="header-right"><span className={`connection ${connected ? '' : 'offline'}`}><span className="live-dot" />{connected ? '실시간 연결' : '재연결 중'}</span><span className="profile-avatar">{nickname.slice(0, 1)}</span><span className="profile-name">{nickname}</span></div></header>
    {!connected && <div className="connection-banner">연결을 다시 시도하고 있습니다. 20초 안에 재연결하면 기존 자리로 돌아옵니다. 대국 시간은 계속 흐릅니다.</div>}
    {!room ? <main className="lobby-page">
      <div className="page-intro"><div><span className="eyebrow">THE LOBBY</span><h1>오늘은 누구와 둘까요?</h1><p>새로운 방을 만들거나, 친구의 방에 들어가세요.</p></div><button className="primary" onClick={() => setCreating(true)} disabled={!connected}><Plus size={18} /> 방 만들기</button></div>
      <div className="lobby-layout"><section className="room-list"><div className="section-heading"><h2>열려 있는 방 <span className="count">{rooms.length}</span></h2><span className="quiet"><Radio size={14} /> 실시간 업데이트</span></div>
        {rooms.length === 0 ? <div className="empty-rooms"><span className="empty-symbol"><Stone color="black" /><Stone color="white" /></span><h3>첫 번째 대국을 열어보세요</h3><p>아직 열린 방이 없어요.<br />친구를 초대하고 함께 시작해볼까요?</p><button className="secondary" onClick={() => setCreating(true)}>방 만들기 <ArrowRight size={16} /></button></div> : <div className="room-cards">{rooms.map(r => <article className="room-card" key={r.code}><div className="room-card-top"><span className="mode-tag">{r.mode === '1v1' ? '1 : 1' : '2 : 2'}</span><span className={`status-tag ${r.phase === 'lobby' ? 'green' : ''}`}>{phaseLabel[r.phase]}</span></div><h3>{r.name}</h3><span className="room-code">#{r.code}</span><div className="room-card-bottom"><span><Users size={15} />{r.players}/{r.mode === '1v1' ? 2 : 4}<Eye size={15} />{r.spectators}/3</span><button className="text-button" onClick={() => void send('join', { code: r.code })} disabled={pending || !connected}>{r.phase === 'lobby' ? '입장' : '관전'}<ArrowRight size={16} /></button></div></article>)}</div>}
      </section><aside className="lobby-aside"><div className="invite-card"><span className="eyebrow">PLAY WITH FRIENDS</span><h2>친구가 기다리고 있나요?</h2><p>전달받은 6자리 방 코드를 입력하세요.</p><form onSubmit={e => { e.preventDefault(); void send('join', { code: joinCode }); }}><input aria-label="방 코드" placeholder="예: A1B2C3" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} /><button className="primary" disabled={joinCode.length !== 6 || pending || !connected}>방 입장하기 <ArrowRight size={16} /></button></form><button className="text-button spectator-join" disabled={joinCode.length !== 6 || pending || !connected} onClick={() => void send('join', { code: joinCode, spectator: true })}><Eye size={15} /> 관전자로 입장</button></div><div className="rules-card"><h3>한 판의 약속</h3><p><span>01</span> 방마다 제한 시간 설정 · 시간 초과 시 팀 패배</p><p><span>02</span> 가위바위보로 흑돌 정하기</p><p><span>03</span> 2대2는 팀을 번갈아 한 수씩</p><p><span>04</span> 5개 이상 이어지면 승리 · 금수 없음</p></div></aside></div>
    </main> : <main className="game-page">
      <div className="room-heading"><div><button className="back-button" onClick={() => ['rps', 'playing'].includes(room.phase) && me?.seat !== null ? setConfirm('leave') : void send('leave')}><ArrowLeft size={16} /> 로비로</button><h1>{room.name} <span className="mode-tag">{room.mode === '1v1' ? '1 : 1' : '2 : 2'}</span></h1></div><button className="invite-button" onClick={() => void copyInvite()}><span className="quiet">방 코드</span><strong>{room.code}</strong><Copy size={16} /></button></div>
      <div className="game-layout">
        <aside className="chat-panel"><div className="chat-heading"><h2><MessageCircle size={17} /> 함께 나누는 대화</h2><span>{room.players.length}</span></div><div className="chat-messages">{room.chat.map(m => m.system ? <div className="system-message" key={m.id}>{m.text}</div> : <div className={`chat-message ${m.nickname === nickname ? 'mine' : ''}`} key={m.id}><div className="chat-meta"><strong>{m.nickname}</strong><time>{new Date(m.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div><div className="chat-bubble">{m.text}</div></div>)}<div ref={chatEnd} /></div><form className="chat-input" onSubmit={sendChat}><input aria-label="채팅 메시지" placeholder="대화를 나눠보세요" maxLength={200} value={chat} onChange={e => setChat(e.target.value)} /><button aria-label="메시지 보내기" disabled={!chat.trim() || !connected}><Send size={18} /></button></form><span className="chat-hint">좋은 한 수만큼, 따뜻한 한마디.</span></aside>
        <section className="board-panel"><div className={`turn-announcement ${myTurn ? "is-mine" : ""}`} role="status">{room.phase === "playing" ? <><span>{room.currentSeat! + 1}번 · {teamOf(room.currentSeat!) + 1}팀</span><strong>{current?.nickname}님의 차례</strong>{myTurn && <b>내 차례! 돌을 놓아주세요</b>}</> : <strong>{phaseLabel[room.phase]}</strong>}</div><div className="board-status"><div><span className={`status-dot ${myTurn ? 'green' : ''}`} /><strong>{room.phase === 'lobby' ? '플레이어를 기다리고 있어요' : room.phase === 'rps' ? '흑돌을 정하고 있어요' : room.phase === 'finished' ? '대국이 끝났어요' : myTurn ? '당신의 차례예요' : `${current?.nickname ?? '상대'}님의 차례`}</strong>{room.phase === 'playing' && <Stone color={currentColor} small />}</div><div className="timer-block"><span className={`timer ${seconds <= 10 && room.phase === 'playing' ? 'urgent' : ''}`}>{room.deadline ? <><span>{seconds.toString().padStart(2, '0')}</span> 초</> : '15 × 15'}</span>{room.deadline && <div className={`time-track ${seconds <= 10 && room.phase === 'playing' ? 'urgent' : ''}`} role="progressbar" aria-label="남은 제한 시간" aria-valuemin={0} aria-valuemax={room.phase === 'rps' ? 3 : room.turnSeconds} aria-valuenow={seconds}><div style={{ transform: `scaleX(${timeRatio})` }} /></div>}</div></div>
          <div className={`board-wrap ${myTurn ? 'my-turn' : ''}`}><img className="board-image" src="/board.png" alt="15 × 15 오목판" draggable={false} /><div className="board-grid" role="grid" aria-label="오목판">{room.board.flatMap((row, y) => row.map((cell, x) => { const last = room.moves.at(-1); const winning = room.winningLine.some(([wx, wy]) => wx === x && wy === y); return <button key={`${x}-${y}`} role="gridcell" aria-label={`${String.fromCharCode(65 + x)}${15 - y}${cell ? cell === 1 ? ' 흑돌' : ' 백돌' : ' 빈자리'}`} className={`board-cell ${winning ? 'winning' : ''}`} disabled={!myTurn || !!cell || pending} onMouseEnter={() => setHover([x, y])} onMouseLeave={() => setHover(null)} onClick={() => void send('move', { x, y })}>{cell ? <><Stone color={cell === 1 ? 'black' : 'white'} />{last?.x === x && last?.y === y && <span className="last-marker" />}</> : myTurn && hover?.[0] === x && hover?.[1] === y ? <span className="preview-stone"><Stone color={currentColor} /></span> : null}</button>; }))}</div>
          {room.phase === 'lobby' && <div className="board-overlay"><div className="waiting-card"><span className="waiting-stones"><Stone color="black" /><Stone color="white" /></span><h2>한 판, 함께 준비해요</h2><p>오른쪽에서 팀과 자리를 선택하고<br />준비 완료 버튼을 눌러주세요.</p><div className="waiting-progress">{activePlayers.filter(p => p.ready).length}<span> / {room.mode === '1v1' ? 2 : 4}명 준비 완료</span></div></div></div>}
          {room.phase === 'rps' && <div className="board-overlay"><div className="rps-card"><span className="eyebrow">FIRST MOVE</span><h2>가위, 바위, 보!</h2><p>이긴 팀이 흑돌로 먼저 시작해요.</p><div className="rps-count">{seconds}</div><div className="rps-choices">{gestures.map(g => <button key={g.value} disabled={!connected || pending || (me?.seat !== 0 && me?.seat !== 1) || room.rpsSelected[me?.seat ?? 0]} onClick={() => void send('rps', { gesture: g.value })}><span>{g.symbol}</span>{g.label}</button>)}</div><div className="rps-team-status">{[0, 1].map(t => <span key={t}>{t + 1}팀 {room.rpsSelected[t] ? '선택 완료 ✓' : '선택 중…'}</span>)}</div><span className="quiet">{me?.seat !== 0 && me?.seat !== 1 ? '팀의 첫 번째 플레이어가 선택합니다.' : '선택은 상대에게 공개되지 않아요.'}</span><span className="rps-round">ROUND {room.rpsRound}</span></div></div>}
          {room.phase === 'finished' && <div className="result-banner"><span className="eyebrow">GOOD GAME</span><h2>{room.result?.winner == null ? '무승부입니다' : `${room.result.winner + 1}팀이 승리했어요!`}</h2><p>{room.result?.reason}</p>{isHost ? <button className="primary" disabled={pending || !connected} onClick={() => void send('reset')}>한 판 더 준비하기 <ArrowRight size={16} /></button> : <span className="quiet">방장이 다음 대국을 준비할 때까지 기다려주세요.</span>}</div>}
          </div><div className="board-footer"><span>{room.moves.length.toString().padStart(2, '0')}번째 수 <span className="footer-divider">/</span> 5개 이상 연결하면 승리</span><span>금수 없음</span></div>
          <div className="turn-sequence"><span>착수 순서</span>{turnOrder.map((seat, i) => <div key={seat} className={room.currentSeat === seat && room.phase === 'playing' ? 'active' : ''}><span className={`seat-dot team-${teamOf(seat)}`}>{seat + 1}</span><span>{room.players.find(p => p.seat === seat)?.nickname ?? '대기'}</span>{i < turnOrder.length - 1 && <ChevronRight size={12} />}</div>)}</div>
        </section>
        <aside className="players-panel">{[0, 1].map(team => <div className={`team-card team-${team}`} key={team}><div className="team-heading"><h2><span className="team-indicator" />{team + 1}팀</h2>{room.blackTeam !== null ? <span className="team-color"><Stone color={room.blackTeam === team ? 'black' : 'white'} small />{room.blackTeam === team ? '흑돌' : '백돌'}</span> : <span className="quiet">{team === 0 ? '플레이어 1' : '플레이어 2'}{room.mode === '2v2' ? ` · ${team === 0 ? 3 : 4}` : ''}</span>}</div>{seatsFor(room.mode).filter(s => teamOf(s) === team).map(seat => { const p = room.players.find(p => p.seat === seat); return <Seat key={seat} player={p} seat={seat} mine={p?.id === identity} host={p?.id === room.hostId} active={room.phase === 'playing' && room.currentSeat === seat} canJoin={room.phase === 'lobby' && connected && !pending} onJoin={() => void send('seat', { seat })} />; })}</div>)}
          <div className="spectator-card"><div className="section-heading"><h3><Eye size={16} /> 관전석</h3><span className="quiet">{room.players.filter(p => p.seat === null).length} / 3</span></div>{room.players.filter(p => p.seat === null).map(p => <div className="spectator" key={p.id}><span className="small-avatar">{p.nickname.slice(0, 1)}</span>{p.nickname}{p.id === identity && <span className="me-tag">나</span>}{!p.connected && <span className="quiet">재연결 중</span>}</div>)}{room.phase === 'lobby' && me?.seat !== null && <button className="spectator-button" disabled={pending || !connected || room.players.filter(p => p.seat === null).length >= 3} onClick={() => void send('seat', { seat: null })}><Plus size={14} /> 관전석으로 이동</button>}{room.players.filter(p => p.seat === null).length === 0 && <p className="quiet spectator-empty">함께 지켜볼 친구를 초대해보세요.</p>}</div>
          {room.phase === 'lobby' && <div className="ready-actions">{me?.seat !== null && <button className={`ready-button ${me?.ready ? 'is-ready' : ''}`} disabled={pending || !connected} onClick={() => void send('ready')}><Check size={18} />{me?.ready ? '준비 완료 · 취소하기' : '준비 완료'}</button>}{isHost && <button className="primary" disabled={!allReady || pending || !connected} onClick={() => void send('start')}>대국 시작 <ArrowRight size={17} /></button>}<p>{isHost ? '모두 준비되면 대국을 시작할 수 있어요.' : '모두 준비되면 방장이 대국을 시작해요.'}</p></div>}
          {['rps', 'playing'].includes(room.phase) && me?.seat !== null && <button className="resign-button" onClick={() => setConfirm('resign')} disabled={pending || !connected}><Flag size={15} /> 기권하기</button>}
          <div className="room-notes"><Shield size={16} /><p>한 수에 {room.turnSeconds}초<br /><span>시간을 넘기면 해당 팀이 패배해요.</span></p></div>
        </aside>
      </div>
    </main>}
    <footer className="app-footer"><span>한 수, 그리고 우리 사이.</span><span>오목 사이 © 2026</span></footer>
    {toast && <div className="toast" role="status">{toast}<button aria-label="알림 닫기" onClick={() => setToast('')}><X size={15} /></button></div>}
    {creating && <div className="modal-backdrop"><form className="modal" onSubmit={async e => { e.preventDefault(); if (await send('create', { name: roomName, mode, turnSeconds })) setCreating(false); }}><button className="modal-close" type="button" aria-label="닫기" onClick={() => setCreating(false)}><X size={20} /></button><span className="eyebrow">NEW ROOM</span><h2>우리의 대국을 시작해요</h2><label htmlFor="room-name">방 이름</label><input id="room-name" value={roomName} maxLength={30} onChange={e => setRoomName(e.target.value)} required autoFocus /><label>대국 방식</label><div className="mode-options">{(['1v1', '2v2'] as Mode[]).map(m => <button className={mode === m ? 'selected' : ''} type="button" key={m} onClick={() => setMode(m)}><Users size={22} /><strong>{m === '1v1' ? '1 대 1' : '2 대 2'}</strong><span>{m === '1v1' ? '마주 앉아 한 수씩' : '두 명이 한 팀으로'}</span></button>)}</div><label htmlFor="turn-seconds">돌 놓는 제한 시간 (초)</label><div className="time-options">{[10, 15, 30, 60, 120].map(t => <button type="button" key={t} className={turnSeconds === t ? "selected" : ""} onClick={() => setTurnSeconds(t)}>{t}초</button>)}</div><input id="turn-seconds" type="number" min={5} max={300} step={1} value={turnSeconds || ""} onChange={e => setTurnSeconds(Number(e.target.value))} required /><p className="quiet">5~300초 · 두 모드 모두 적용 · 시간 초과 시 팀 패배<br />관전자 3명 · 가위바위보는 3초로 선공 결정</p><button className="primary" disabled={!roomName.trim() || pending || !connected}>방 만들기 <ArrowRight size={17} /></button></form></div>}
    {confirm && <div className="modal-backdrop"><div className="modal confirm-modal"><h2>{confirm === 'resign' ? '기권하시겠어요?' : '방을 나가시겠어요?'}</h2><p>대국 중 기권하거나 퇴장하면 우리 팀이 패배합니다.</p><div><button className="secondary" onClick={() => setConfirm(null)}>계속 플레이</button><button className="danger" disabled={pending} onClick={async () => { if (await send(confirm)) setConfirm(null); }}>{confirm === 'resign' ? '기권하기' : '나가기'}</button></div></div></div>}
  </div>;
}

function Seat({ player, seat, mine, host, active, canJoin, onJoin }: { player?: Player; seat: number; mine: boolean; host: boolean; active: boolean; canJoin: boolean; onJoin: () => void }) {
  return player ? <div className={`player-seat ${active ? 'active' : ''}`}><div className={`player-avatar team-${teamOf(seat)}`}>{player.nickname.slice(0, 1)}<span>{seat + 1}</span></div><div className="player-detail"><strong>{player.nickname}{mine && <span className="me-tag">나</span>}</strong><span>{!player.connected ? '재연결 중…' : active ? '지금 두는 중' : player.ready ? '준비 완료' : '대기 중'}{host && ' · 방장'}</span></div>{player.ready && player.connected && <Check className="ready-check" size={16} />}</div> : <button className="empty-seat" disabled={!canJoin} onClick={onJoin}><span><Plus size={18} /></span><div><strong>빈 자리</strong><small>플레이어 {seat + 1}로 참가</small></div></button>;
}
