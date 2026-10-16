import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { canSee } from './public/vision.js';
import { teamActivity } from './team-activity.js';
import { Room, distance, lineOfSight, terrorCue } from './game.js';
import { CONFIG as C } from './config.js';
import { createIdentityStore, credentials, readSession, sessionCookie, DEFAULT_COLORS } from './accounts.js';
import { createSocialLobby } from './social.js';
const identityContexts=new WeakMap();

const root=path.dirname(fileURLToPath(import.meta.url));
const clean=(value,max)=>{if(typeof value!=='string')throw new Error('텍스트를 입력해주세요.');const s=value.trim().replace(/[\u0000-\u001f\u007f]/g,'');if(!s||s.length>max)throw new Error(`1~${max}자로 입력해주세요.`);return s;};

// Attach to an existing Socket.IO server without opening another Render port.
export function createNightfall(io,options={}) {
  const authReady=createIdentityStore(options);
  authReady.catch(error=>{
    // Log a diagnostic category, never credentials, connection strings or raw DB errors.
    const code=error.message==='계정 영구 저장을 위해 DATABASE_URL을 설정해주세요.'?'DATABASE_URL_REQUIRED':/^[A-Z0-9_]{2,32}$/.test(error.code||'')?error.code:'IDENTITY_INIT_FAILED';
    console.error('NIGHTFALL account initialization failed',JSON.stringify({code,databaseConfigured:!!process.env.DATABASE_URL}));
  });
  const authContext={ready:authReady,io,allowGuest:options.allowGuest===true,attempts:new Map(),hashing:0};
  if(io.httpServer)identityContexts.set(io.httpServer,authContext);
  const ns=io.of('/nightfall'),rooms=new Map(),sessions=new Map();
  const debugAccounts=new Set(options.debugAccountIds??(process.env.NIGHTFALL_DEBUG_ACCOUNT_IDS||'').split(',').map(id=>id.trim()).filter(Boolean));
  const canDebug=(socket,p)=>debugAccounts.has(socket.data.account?.id)||((options.allowLocalDebug??process.env.NODE_ENV!=='production')&&p?.name==='admin');
  const chats=new WeakMap();
  const channelFor=(room,p)=>p?.role==='survivor'&&['playing','finished'].includes(room.phase)?(p.status==='out'?'dead':'survivors'):null;
  const directory=()=>[...rooms.values()].map(r=>({code:r.code,name:r.name,count:r.players.size,max:r.maxPlayers,phase:r.phase}));
  const social=createSocialLobby({ns,sessions,rooms,join:joinRoom});
  const sendDirectory=()=>{ns.emit('directory',directory());social.refresh();};
  function joinRoom(socket,session,room,nickname){
    if(session.roomCode)throw new Error('현재 방에서 먼저 나가주세요.');
    const p=room.addPlayer(socket.data.account?.nickname||nickname,'waiting');p.accountId=socket.data.account?.id||null;p.cosmetics={...DEFAULT_COLORS,...socket.data.profile};session.roomCode=room.code;session.playerId=p.id;socket.emit('identity',p.id);broadcast(room,true);sendDirectory();
  }
  function sendRoom(socket,room,full=false,snapshot=null) {
    if(!room)return;
    const session=sessions.get(socket.data.token), own=room.players.get(session?.playerId);
    if(!own)return;
    const s={...(snapshot??room.snapshot())};
    const channel=channelFor(room,own);
    s.chat={channel,messages:channel?(chats.get(room)?.[channel]||[]):[]};
    const admin=canDebug(socket,own),debugFullMap=admin&&session.debugFullMap===true;
    s.debug={enabled:admin,fullMap:debugFullMap,...(admin?{serverTickRate:C.tickRate}: {})};
    let view=own;
    if(['out','escaped'].includes(own.status)) {
      const targets=s.players.filter(p=>['alive','down','caged','carried'].includes(p.status));
      view=targets.find(p=>p.id===own.spectateId)||targets[0]||own;
    }
    s.viewId=view.id;s.windowBlocks=Object.entries(room.players.get(view.id)?.vaultCounts||{}).filter(([,v])=>v.blockedUntil>room.elapsed).map(([id,v])=>({id,until:v.blockedUntil}));
    const radius=C.survivorVision*(view.role==='killer'?C.killerVisionMultiplier:1);
    s.players=s.players.map(p=>{
      const teamAura=view.role==='survivor'&&p.role==='survivor'&&!p.hidden&&(['down','caged'].includes(p.status)||view.status==='down');
      const keyAura=view.role==='survivor'&&!view.hidden&&view.keyAuraUntil>room.elapsed&&p.role==='survivor'&&!p.hidden&&distance(view,p)<C.keyRange;
      const visible=debugFullMap||p.id===view.id||teamAura||keyAura||(!p.hidden&&canSee(room.map,view,p,C));
      return {...p,teamActivity:view.role==='survivor'&&p.role==='survivor'?teamActivity(room,room.players.get(p.id)):null,hookStage:view.role==='survivor'||p.id===view.id?p.hookStage:null,x:visible?p.x:null,y:visible?p.y:null,hidden:debugFullMap||p.id===view.id?p.hidden:null,palletDrop:visible?p.palletDrop:null,skill:p.id===own.id?p.skill:null,vault:visible?p.vault:null,action:p.id===own.id?p.action:null};
    });
    // Full object inspection is available only to the explicitly requested admin nickname.
    if(!debugFullMap)s.map={...s.map,hatch:s.map.hatch.visible?s.map.hatch:{visible:false,open:false,x:null,y:null},chests:s.map.chests.map(({item,...c})=>c),items:(s.map.items||[]).filter(i=>canSee(room.map,view,i,C)),cabinets:s.map.cabinets.map(({occupant,...c})=>c),generators:s.map.generators.map(({workers,...g})=>g),cages:s.map.cages.map(({rescuers,...c})=>c)};
    s.audio=[...room.players.values()].filter(p=>p.id!==view.id&&['alive','down'].includes(p.status)&&!p.elusive).flatMap(p=>{
      const d=distance(view,p),range=(p.hidden?8:16)*C.pixelsPerMeter;
      if(d>=range)return [];const volume=(1-d/range)*(lineOfSight(room.map,view,p)?1:.5),pan=Math.max(-1,Math.min(1,(p.x-view.x)/range));
      const sounds=[];if(p.health<2)sounds.push({id:p.id,kind:'pain',volume,pan});
      if(!p.hidden&&p.moveSpeed>1&&!p.task&&!p.vault)sounds.push({id:p.id,kind:'step',volume:volume*(p.input.crouch?.2:p.input.run?1:.5),pan,running:p.input.run});
      return sounds;
    });
    const killer=[...room.players.values()].find(p=>p.role==='killer');
    const cue=terrorCue(room.phase,view,killer);s.heartbeat=cue.strength;s.heartbeatDirection=cue.direction;
    const hit=room.players.get(view.id);s.hit=room.phase==='playing'&&view.role==='survivor'?{sequence:hit.hitSequence,time:hit.lastHitAt}:null;
    s.beacons=view.role==='survivor'?room.beacons:[];
    s.traces=debugFullMap||view.role==='killer'?s.traces.filter(t=>debugFullMap||canSee(room.map,view,t,C)):[];
    s.noises=debugFullMap||view.role==='killer'?s.noises:[];
    if(!full) { const {walls,bushes,width,height,seed,zones,paths,decor,spawns,windows,name,structures,...dynamic}=s.map;s.map=dynamic;delete s.config;delete s.perks; }
    socket.emit('state',s);
  }
  function broadcast(room,full=false){let snapshot;for(const socket of ns.sockets.values())if(sessions.get(socket.data.token)?.roomCode===room.code){snapshot??=room.snapshot();sendRoom(socket,room,full,snapshot);}}
  function leave(session) {
    const room=rooms.get(session.roomCode), p=room?.players.get(session.playerId);
    if(p){p.connected=false;p.input={x:0,y:0,space:false};p.disconnectTime=C.disconnectGraceSeconds;if(room.phase!=='playing')room.players.delete(p.id);
      if(room.hostId===p.id)room.hostId=[...room.players.values()].find(q=>q.connected)?.id||null;
      if(![...room.players.values()].some(q=>q.connected)){rooms.delete(room.code);}else broadcast(room,true);
    }
    session.roomCode=null;session.playerId=null;session.debugFullMap=false;sendDirectory();
  }
  ns.use((socket,next)=>{void (async()=>{
    const identity=await authReady,sessionToken=readSession(socket.handshake.headers.cookie),account=sessionToken?await identity.accounts.authenticate(sessionToken):null;
    const origin=socket.handshake.headers.origin;
    if(origin&&new URL(origin).host!==socket.handshake.headers.host)throw new Error('허용되지 않은 접속 경로입니다.');
    if(account){socket.data.account={id:account.id,nickname:account.nickname};socket.data.token=account.id;socket.data.sessionToken=sessionToken;socket.data.authChecked=Date.now();socket.data.profile=await identity.getProfile(account.id);}
    else if(options.allowGuest===true){const token=socket.handshake.auth.token;if(typeof token!=='string'||! /^[a-f0-9-]{36}$/i.test(token))throw new Error('접속 토큰이 올바르지 않습니다.');socket.data.token=token;}
    else throw new Error('로그인이 필요합니다.');
  })().then(()=>next(),e=>next(new Error(e.message==='로그인이 필요합니다.'?e.message:'계정 연결을 확인해주세요.')));});
  ns.on('connection',socket=>{
    const token=socket.data.token;
    let session=sessions.get(token);
    if(session?.socketId)ns.sockets.get(session.socketId)?.disconnect(true);
    session??={roomCode:null,playerId:null,socketId:null,disconnectedAt:null,lastAction:0};
    session.socketId=socket.id;session.disconnectedAt=null;sessions.set(token,session);
    social.attach(socket);
    if(socket.data.account)socket.emit('account',{...socket.data.account,...socket.data.profile});
    socket.emit('directory',directory());
    const previous=rooms.get(session.roomCode),p=previous?.players.get(session.playerId);
    if(p){p.connected=true;p.bot=false;p.disconnectTime=0;socket.emit('identity',p.id);broadcast(previous,true);}else {session.roomCode=null;session.playerId=null;socket.emit('state',null);}
    const active=()=>{const room=rooms.get(session.roomCode);if(!room)throw new Error('먼저 방에 입장해주세요.');return room;};
    const action=(event,fn)=>socket.on(event,async(data,ack)=>{try{if(session.socketId!==socket.id)throw new Error('다른 창에서 연결되었습니다.');if(event!=='input'){if(Date.now()-session.lastAction<100)throw new Error('잠시 후 다시 시도해주세요.');session.lastAction=Date.now();}await fn(data);if(typeof ack==='function')ack({ok:true});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.message});}});
    action('create',data=>{
      if(session.roomCode)throw new Error('현재 방에서 먼저 나가주세요.');if(rooms.size>=50)throw new Error('현재 생성 가능한 방이 모두 찼습니다.');
      const name=clean(data?.name,24),nickname=socket.data.account?.nickname||clean(data?.nickname,12),max=Number(data?.maxPlayers??C.defaultPlayers);if(!Number.isInteger(max)||max<3||max>C.maxPlayers)throw new Error('정원은 3~16명입니다.');
      let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
      const room=new Room(code,name,max),p=room.addPlayer(nickname,'waiting');rooms.set(code,room);p.accountId=socket.data.account?.id||null;p.cosmetics={...DEFAULT_COLORS,...socket.data.profile};session.roomCode=code;session.playerId=p.id;socket.emit('identity',p.id);broadcast(room,true);sendDirectory();
    });
    action('directory:refresh',()=>socket.emit('directory',directory()));
    action('join',data=>{const code=clean(data?.code,6).toUpperCase(),room=rooms.get(code);if(!room)throw new Error('방 코드를 확인해주세요.');joinRoom(socket,session,room,socket.data.account?.nickname||clean(data?.nickname,12));});
    action('debug-view',data=>{const r=active(),p=r.players.get(session.playerId);if(!canDebug(socket,p))throw new Error('admin 플레이어만 디버깅 모드를 사용할 수 있습니다.');if(typeof data?.fullMap!=='boolean')throw new Error('맵 보기 값이 올바르지 않습니다.');session.debugFullMap=data.fullMap;sendRoom(socket,r,true);});
    socket.on('debug-ping',ack=>{if(session.socketId===socket.id&&canDebug(socket,rooms.get(session.roomCode)?.players.get(session.playerId))&&typeof ack==='function')ack({ok:true});});
    action('profile:set',async data=>{
      if(!socket.data.account)throw new Error('로그인이 필요합니다.');
      const room=rooms.get(session.roomCode);if(room&&room.phase!=='lobby')throw new Error('경기가 끝난 뒤 색상을 변경해주세요.');
      const identity=await authReady,profile=await identity.saveProfile(socket.data.account.id,data);socket.data.profile=profile;
      const currentRoom=rooms.get(session.roomCode),player=currentRoom?.players.get(session.playerId);if(player&&currentRoom.phase==='lobby')player.cosmetics=profile;
      socket.emit('account',{...socket.data.account,...profile});if(currentRoom)broadcast(currentRoom,true);
    });
    action('role',data=>{const r=active();r.setRole(session.playerId,data?.role);broadcast(r,true);});
    action('loadout',data=>{const r=active();r.loadout(session.playerId,data);broadcast(r,true);});
    action('start',()=>{const r=active();r.start(session.playerId);chats.set(r,{survivors:[],dead:[]});broadcast(r,true);sendDirectory();});
    action('chat',data=>{const r=active(),p=r.players.get(session.playerId),channel=channelFor(r,p);if(!channel)throw new Error('생존자와 사망자만 게임 내 채팅을 사용할 수 있습니다.');if(Date.now()-(session.lastChat||0)<700)throw new Error('메시지를 너무 빠르게 보내고 있습니다.');const message={id:randomBytes(12).toString('hex'),name:p.name,text:clean(data?.text,200),time:Date.now()};session.lastChat=Date.now();if(!chats.has(r))chats.set(r,{survivors:[],dead:[]});const history=chats.get(r)[channel];history.push(message);if(history.length>50)history.shift();broadcast(r);});
    action('end-trial',()=>{const r=active();r.endTrial(session.playerId);broadcast(r);});
    action('reset',()=>{const r=active();r.reset(session.playerId);broadcast(r,true);sendDirectory();});
    action('leave',()=>{leave(session);socket.emit('state',null);});
    action('input',data=>{const r=active(),p=r.players.get(session.playerId);if(!p)return;p.lastInputAt=Date.now();const old=p.input;const axis=v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;const ax=axis(data?.aimX),ay=axis(data?.aimY),len=Math.hypot(ax,ay);p.input={x:axis(data?.x),y:axis(data?.y),aimX:len?ax/len:1,aimY:len?ay/len:0};for(const key of ['space','work','run','crouch','attack','item','self','drop']){p.input[key]=data?.[key]===true;if(['space','attack','self','drop'].includes(key)&&p.input[key]&&!old[key])p.pendingPress.add(key);}});
    socket.on('disconnect',()=>{if(session.socketId!==socket.id)return;session.socketId=null;session.disconnectedAt=Date.now();const r=rooms.get(session.roomCode),p=r?.players.get(session.playerId);if(p){p.connected=false;p.input={x:0,y:0,space:false};if(r.hostId===p.id)r.hostId=[...r.players.values()].find(q=>q.connected)?.id||p.id;broadcast(r,true);}sendDirectory();});
    sendDirectory();
  });
  let ticks=0,last=performance.now();
  const timer=setInterval(()=>{
    for(const socket of ns.sockets.values())if(socket.data.account&&!socket.data.authPending&&Date.now()-socket.data.authChecked>60000){
      socket.data.authPending=true;void authReady.then(identity=>identity.accounts.authenticate(socket.data.sessionToken)).then(account=>{if(!account)socket.disconnect(true);socket.data.authChecked=Date.now();}).catch(()=>socket.disconnect(true)).finally(()=>socket.data.authPending=false);
    }
    const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;ticks++;
    for(const room of rooms.values()){const before=room.phase;for(const p of room.players.values())if(p.connected&&p.lastInputAt&&Date.now()-p.lastInputAt>2000){p.input={x:0,y:0,aimX:p.facing.x,aimY:p.facing.y};p.pendingPress.clear();p.lastInputAt=null;}room.tick(dt);if(ticks%3===0&&room.phase!=='lobby')broadcast(room);else if(ticks%3===0)for(const socket of ns.sockets.values()){const s=sessions.get(socket.data.token);if(s?.roomCode===room.code&&s.debugFullMap)sendRoom(socket,room);}if(before!==room.phase)sendDirectory();}
    if(ticks%C.tickRate===0)for(const [token,s] of sessions){if(s.disconnectedAt&&Date.now()-s.disconnectedAt>C.disconnectGraceSeconds*1000){leave(s);sessions.delete(token);}}
  },1000/C.tickRate);timer.unref();
  let closePromise=null;
  return {rooms,namespace:ns,auth:authContext,ready:authReady,syncRoom(room,full=true){if(rooms.get(room?.code)!==room)throw new Error('등록된 방이 아닙니다.');broadcast(room,full);},close(){return closePromise??=(async()=>{clearInterval(timer);for(const socket of ns.sockets.values())socket.conn.close();const identity=await authReady.catch(()=>null);await identity?.close();})();}};
}

async function handleAccountRequest(req,res,url,base,context){
  const route=url.pathname.slice(base.length);
  if(!url.pathname.startsWith(base+'/api/')||!['/api/auth/register','/api/auth/login','/api/auth/logout','/api/me'].includes(route))return false;
  const respond=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
    const identity=await context.ready,token=readSession(req.headers.cookie);
    if(route==='/api/me'&&req.method==='GET'){
      const account=token?await identity.accounts.authenticate(token):null;
      respond(account?200:401,account?{ok:true,account:{id:account.id,nickname:account.nickname,...await identity.getProfile(account.id)}}:{ok:false,error:'로그인이 필요합니다.'});return true;
    }
    if(req.method!=='POST'){respond(405,{ok:false,error:'허용되지 않은 요청입니다.'});return true;}
    if(req.headers['x-nightfall-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')){respond(403,{ok:false,error:'게임 화면에서 다시 요청해주세요.'});return true;}
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{respond(403,{ok:false,error:'허용되지 않은 요청입니다.'});return true;}if(origin.host!==req.headers.host){respond(403,{ok:false,error:'허용되지 않은 요청입니다.'});return true;}}
    const secure=process.env.NODE_ENV==='production';
    if(route==='/api/auth/logout'){
      if(token)await identity.accounts.logout(token);
      for(const socket of context.io.of('/nightfall').sockets.values())if(socket.data.sessionToken===token)socket.disconnect(true);
      res.setHeader('Set-Cookie',sessionCookie(null,secure));respond(200,{ok:true});return true;
    }
    // Bound UTF-8 bytes before parsing; proxy peers must not share one account's limit.
    let body=req.body;
    if(!body){if(Number(req.headers['content-length'])>2048){req.resume();respond(413,{ok:false,error:'입력 내용이 너무 깁니다.'});return true;}const chunks=[];let bytes=0;for await(const chunk of req.iterator({destroyOnReturn:false})){bytes+=chunk.length;if(bytes>2048){req.resume();respond(413,{ok:false,error:'입력 내용이 너무 깁니다.'});return true;}chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    const name=typeof body?.nickname==='string'?body.nickname.normalize('NFC').trim().toLowerCase().slice(0,64):'';
    const key=(req.socket.remoteAddress||'unknown')+':'+name,now=Date.now(),attempt=context.attempts.get(key);
    if(attempt&&now-attempt.start<60000&&attempt.count>=12){respond(429,{ok:false,error:'시도가 많습니다. 잠시 후 다시 시도해주세요.'});return true;}
    context.attempts.set(key,attempt&&now-attempt.start<60000?{...attempt,count:attempt.count+1}:{start:now,count:1});
    if(context.attempts.size>5000){for(const [ip,a]of context.attempts)if(now-a.start>60000)context.attempts.delete(ip);while(context.attempts.size>5000)context.attempts.delete(context.attempts.keys().next().value);}
    const data=credentials(body),register=route.endsWith('/register');
    if(context.hashing>=4){respond(429,{ok:false,error:'접속 요청이 많습니다. 잠시 후 다시 시도해주세요.'});return true;}
    let account;context.hashing++;
    try{account=register?await identity.accounts.register(data.nickname,data.password):await identity.accounts.login(data.nickname,data.password);}finally{context.hashing--;}
    if(!account){respond(401,{ok:false,error:'닉네임 또는 비밀번호를 확인해주세요.'});return true;}
    const session=await identity.accounts.createSession(account.id);
    res.setHeader('Set-Cookie',sessionCookie(session,secure));respond(register?201:200,{ok:true,account:{id:account.id,nickname:account.nickname,...await identity.getProfile(account.id)}});
  }catch(e){
    if(e.message==='중복된 닉네임입니다.')respond(409,{ok:false,error:e.message});
    else if(e instanceof SyntaxError)respond(400,{ok:false,error:'입력 내용을 확인해주세요.'});
    else if(/닉네임은|비밀번호는/.test(e.message))respond(400,{ok:false,error:e.message});
    else respond(503,{ok:false,error:'계정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'});
  }
  return true;
}

export async function handleNightfallRequest(req,res,base='/dbd') {
  let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end('Invalid request URL');return true;}
  const auth=identityContexts.get(req.socket.server);
  if(auth&&await handleAccountRequest(req,res,url,base,auth))return true;
  if(url.pathname===`${base}/api/health`){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,game:'nightfall'}));return true;}
  if(url.pathname===base){res.writeHead(302,{Location:`${base}/`});res.end();return true;}
  if(!url.pathname.startsWith(`${base}/`))return false;
  const file=url.pathname.slice(base.length+1)||'index.html';
  if(!['index.html','account.js','account.css','lobby.css','social.js','social.css','app.js','scene.js','skill-check.js','feedback.js','team-hud.js','vision.js','audio.js','style.css','debug.js','debug.css','chat.js','chat.css'].includes(file)){res.writeHead(404);res.end('Not found');return true;}
  try {const body=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(500);res.end('Game assets unavailable');}return true;
}
export function createStandaloneServer(options={}){const http=createServer((req,res)=>{void handleNightfallRequest(req,res).then(handled=>{if(handled)return;if(req.url==='/'){res.writeHead(302,{Location:'/dbd/'});res.end();}else{res.writeHead(404);res.end();}}).catch(()=>{if(!res.headersSent){res.writeHead(500);res.end('Game request failed');}else res.destroy();});});const io=new Server(http,{maxHttpBufferSize:16384});const game=createNightfall(io,options);let closePromise=null;return {http,io,game,close:()=>closePromise??=(async()=>{await game.close();await new Promise(resolve=>io.close(resolve));})()};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createStandaloneServer(),port=Number(process.env.PORT)||3002;server.http.listen(port,'0.0.0.0',()=>console.log(`NIGHTFALL: http://localhost:${port}/dbd/`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
}
