import {randomUUID} from 'node:crypto';

// Lobby traffic is kept separate from the role-restricted in-match chat.
export function createSocialLobby({ns,sessions,rooms,join}){
  const main=[],roomChats=new WeakMap(),invitations=new Map();
  const current=socket=>sessions.get(socket.data.token);
  const roomOf=socket=>rooms.get(current(socket)?.roomCode);
  const nameOf=socket=>socket.data.account?.nickname||roomOf(socket)?.players.get(current(socket)?.playerId)?.name;
  const live=socket=>socket.connected&&current(socket)?.socketId===socket.id;
  const scopeOf=socket=>!current(socket)?.roomCode?'main':roomOf(socket)?.phase==='lobby'?'room:'+roomOf(socket).code:null;
  const history=socket=>{const room=roomOf(socket);if(!room)return main;if(!roomChats.has(room))roomChats.set(room,[]);return roomChats.get(room);};
  function sync(socket){const scope=scopeOf(socket);socket.emit('social:state',{scope,messages:scope?history(socket):[]});}
  function refresh(){
    const people=[...ns.sockets.values()].filter(s=>live(s)&&nameOf(s)).map(s=>({id:s.data.token,name:nameOf(s),status:!roomOf(s)?'main':roomOf(s).phase==='lobby'?'room':'playing'}));
    for(const s of ns.sockets.values())if(live(s)){s.emit('social:presence',people);sync(s);}
    for(const [id,v]of invitations)if(v.expires<=Date.now()||!rooms.has(v.code))invitations.delete(id);
  }
  function attach(socket){
    const handle=(event,fn)=>socket.on(event,(data,ack)=>{try{if(!live(socket)||!socket.data.account)throw new Error('로그인이 필요합니다.');fn(data);if(typeof ack==='function')ack({ok:true});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.message});}});
    handle('social:sync',()=>{const session=current(socket);if(Date.now()-(session.lastSocialSync||0)<1000)throw new Error('잠시 후 다시 시도해주세요.');session.lastSocialSync=Date.now();sync(socket);});
    handle('social:send',data=>{
      const scope=scopeOf(socket);if(!scope)throw new Error('경기 중에는 로비 채팅을 사용할 수 없습니다.');
      if(typeof data?.text!=='string')throw new Error('메시지를 입력해주세요.');
      const text=data.text.replace(/[\u0000-\u001f\u007f]/g,'').trim();if(!text||text.length>200)throw new Error('메시지는 1~200자로 입력해주세요.');
      const session=current(socket);if(Date.now()-(session.lastSocialChat||0)<700)throw new Error('메시지를 너무 빠르게 보내고 있습니다.');session.lastSocialChat=Date.now();
      const messages=history(socket);messages.push({id:randomUUID(),name:nameOf(socket),text,time:Date.now()});if(messages.length>50)messages.shift();
      for(const s of ns.sockets.values())if(live(s)&&scopeOf(s)===scope)sync(s);
    });
    handle('social:invite',data=>{
      const sourceRoom=roomOf(socket),target=[...ns.sockets.values()].find(s=>live(s)&&s.data.account&&s.data.token===data?.targetId);
      if(!sourceRoom||sourceRoom.phase!=='lobby')throw new Error('게임 로비에서만 초대할 수 있습니다.');
      if(sourceRoom.players.size>=sourceRoom.maxPlayers)throw new Error('방이 가득 찼습니다.');
      if(!target||target===socket||current(target)?.roomCode)throw new Error('메인 로비에 있는 접속자만 초대할 수 있습니다.');
      const now=Date.now(),session=current(socket);if(now-(session.lastSocialInvite||0)<700)throw new Error('초대 요청을 너무 빠르게 보내고 있습니다.');for(const [id,v]of invitations)if(v.expires<=now)invitations.delete(id);
      if([...invitations.values()].some(v=>v.from===socket.data.token&&v.to===target.data.token&&v.expires-now>55000))throw new Error('이미 초대했습니다. 잠시 후 다시 시도해주세요.');
      if(invitations.size>=1000)throw new Error('초대 요청이 많습니다. 잠시 후 다시 시도해주세요.');
      session.lastSocialInvite=now;const id=randomUUID(),invite={id,from:socket.data.token,to:target.data.token,code:sourceRoom.code,expires:now+60000};invitations.set(id,invite);
      target.emit('social:invite',{id,fromName:nameOf(socket),roomName:sourceRoom.name,code:sourceRoom.code,expires:invite.expires});
    });
    handle('social:decline',data=>{const v=invitations.get(data?.id);if(v?.to===socket.data.token)invitations.delete(v.id);});
    handle('social:accept',data=>{
      const v=invitations.get(data?.id),source=v&&sessions.get(v.from),r=v&&rooms.get(v.code);
      if(!v||v.to!==socket.data.token||v.expires<=Date.now()||!source?.socketId||source.roomCode!==v.code||!r||r.phase!=='lobby')throw new Error('만료되었거나 사용할 수 없는 초대입니다.');
      if(current(socket)?.roomCode)throw new Error('현재 방에서 먼저 나가주세요.');
      join(socket,current(socket),r,socket.data.account.nickname);invitations.delete(v.id);refresh();
    });
    sync(socket);
    if(!current(socket)?.roomCode)for(const v of invitations.values()){
      const source=sessions.get(v.from),room=rooms.get(v.code),sender=source?.socketId&&ns.sockets.get(source.socketId);
      if(v.to===socket.data.token&&v.expires>Date.now()&&sender&&source.roomCode===v.code&&room?.phase==='lobby')socket.emit('social:invite',{id:v.id,fromName:nameOf(sender),roomName:room.name,code:room.code,expires:v.expires});
    }
  }
  return {attach,refresh};
}
