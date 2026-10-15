export function createLobbyUI({socket,getState,getAccount,notify,clearInput}){
  const $=id=>document.getElementById(id),people=new Map(),invitations=new Map(),chatKeys={main:'',room:''};
  let chatState={scope:null,messages:[]},rosterKey='',presenceKey='',inviteKey='',pendingInvite=new Set();
  const labels={main:'메인 로비',room:'게임 로비',playing:'경기 중'};
  function request(event,data={}){return new Promise((resolve,reject)=>{if(!socket.connected)return reject(new Error('서버 연결을 확인해주세요.'));socket.timeout(7000).emit(event,data,(e,r)=>e?reject(new Error('응답이 지연됩니다. 다시 시도해주세요.')):r?.ok?resolve(r):reject(new Error(r?.error||'요청을 완료하지 못했습니다.')));});}
  function empty(text){const p=document.createElement('p');p.className='social-empty';p.textContent=text;return p;}
  function personRow(p,invite=false){
    const row=document.createElement('div');row.className='online-person';const avatar=document.createElement('span'),body=document.createElement('div'),name=document.createElement('b'),status=document.createElement('small');
    avatar.className='online-avatar';avatar.textContent=p.name.slice(0,1);name.textContent=p.name+(p.id===getAccount()?.id?' · 나':'');status.textContent=labels[p.status]||'접속 중';body.append(name,status);row.append(avatar,body);
    if(invite){const b=document.createElement('button');b.type='button';b.textContent=pendingInvite.has(p.id)?'초대 보냄':'초대';b.disabled=pendingInvite.has(p.id)||!socket.connected;b.setAttribute('aria-label',p.name+' 초대');b.onclick=async()=>{b.disabled=true;try{await request('social:invite',{targetId:p.id});pendingInvite.add(p.id);b.textContent='초대 보냄';notify(p.name+' 님에게 초대를 보냈습니다.');setTimeout(()=>{pendingInvite.delete(p.id);presenceKey='';renderPeople();},5000);}catch(e){notify(e.message);b.disabled=false;}};row.append(b);}
    return row;
  }
  function renderPeople(){
    const account=getAccount(),state=getState(),all=[...people.values()].sort((a,b)=>(a.id===account?.id?-1:b.id===account?.id?1:a.name.localeCompare(b.name,'ko')));
    const key=JSON.stringify(all)+account?.id+state?.code+socket.connected+[...pendingInvite].join();if(key===presenceKey)return;presenceKey=key;
    $('online-count').textContent=all.length+'명';$('online-list').replaceChildren(...(all.length?all.map(p=>personRow(p)):[empty('접속자를 기다리고 있습니다.')]));
    const available=all.filter(p=>p.id!==account?.id&&p.status==='main');$('invite-count').textContent=available.length+'명';
    $('invite-list').replaceChildren(...(available.length?available.map(p=>personRow(p,true)):[empty('지금 초대할 수 있는 접속자가 없습니다.')]));
  }
  function renderChat(){
    const s=getState(),scope=!s?'main':s.phase==='lobby'?'room:'+s.code:null,kind=!s?'main':'room';
    if(chatState.scope!==scope||!scope)return;
    const list=$(kind+'-chat-log'),key=scope+chatState.messages.map(m=>m.id).join();if(chatKeys[kind]===key)return;chatKeys[kind]=key;
    const bottom=list.scrollHeight-list.scrollTop-list.clientHeight<40;
    if(!chatState.messages.length){list.replaceChildren(empty(kind==='main'?'아직 조용하네요. 첫 인사를 건네보세요.':'진영을 고르며 함께 이야기해보세요.'));return;}
    const wanted=new Set(chatState.messages.map(m=>m.id));for(const row of [...list.children])if(!wanted.has(row.dataset.message))row.remove();
    const existing=new Set([...list.children].map(n=>n.dataset.message));
    for(const m of chatState.messages)if(!existing.has(m.id)){const row=document.createElement('article'),head=document.createElement('div'),name=document.createElement('b'),time=document.createElement('time'),body=document.createElement('p');row.className='social-message';row.dataset.message=m.id;name.textContent=m.name;time.textContent=new Date(m.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});body.textContent=m.text;head.append(name,time);row.append(head,body);list.append(row);}
    if(bottom)list.scrollTop=list.scrollHeight;
  }
  for(const kind of ['main','room'])$(kind+'-chat-form').onsubmit=async e=>{
    e.preventDefault();const input=$(kind+'-chat-input'),button=e.currentTarget.querySelector('button'),text=input.value.trim();if(!text)return;
    button.disabled=true;try{await request('social:send',{text});input.value='';$(kind+'-chat-error').textContent='';}catch(error){$(kind+'-chat-error').textContent=error.message;}finally{button.disabled=false;input.focus();}
  };
  function move(role){request('role',{role}).catch(e=>notify(e.message));}
  $('choose-waiting').onclick=()=>move('waiting');
  for(const zone of document.querySelectorAll('.faction')){
    zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-nightfall-player')){e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('drop-hover');}});
    zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drop-hover');});
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drop-hover');const own=getState()?.players.find(p=>p.accountId===getAccount()?.id);if(own&&e.dataTransfer.getData('application/x-nightfall-player')===own.id)move(zone.dataset.role);});
  }
  function renderTeams(){
    const s=getState();if(!s||s.phase!=='lobby'){rosterKey='';return;}const own=s.players.find(p=>p.accountId===getAccount()?.id);
    const key=JSON.stringify(s.players.map(p=>[p.id,p.name,p.role,p.connected,p.cosmetics]))+s.hostId+own?.id+socket.connected;if(key===rosterKey)return;rosterKey=key;
    for(const role of ['waiting','killer','survivor']){
      const list=$(role+'-players'),players=s.players.filter(p=>p.role===role);list.replaceChildren();
      if(!players.length)list.append(empty(role==='killer'?'비어 있는 살인마 자리':role==='survivor'?'함께 살아남을 사람을 기다립니다.':'모두 진영을 선택했습니다.'));
      for(const p of players){const card=document.createElement('article'),portrait=document.createElement('span'),body=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');card.className='faction-player'+(p.id===own?.id?' is-self':'');portrait.className='player-portrait '+role;const color=role==='killer'?p.cosmetics?.killerColor:p.cosmetics?.survivorColor;if(/^#[0-9a-f]{6}$/i.test(color||''))portrait.style.setProperty('--outfit',color);name.textContent=p.name+(p.id===own?.id?' · 나':'');meta.textContent=(p.id===s.hostId?'방장 · ':'')+(p.connected?(p.id===own?.id?'내 카드를 옮길 수 있어요':'접속 중'):'재접속 중');body.append(name,meta);card.append(portrait,body);
        if(p.id===own?.id){card.draggable=true;card.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-nightfall-player',p.id);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');});card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.drop-hover').forEach(n=>n.classList.remove('drop-hover'));});}list.append(card);}
      const button=$('choose-'+role);button.disabled=!socket.connected||own?.role===role||(role==='killer'&&players.length>0);button.setAttribute('aria-pressed',String(own?.role===role));
    }
    $('waiting-count').textContent=s.players.filter(p=>p.role==='waiting').length+'명';$('survivor-count').textContent=s.players.filter(p=>p.role==='survivor').length+'명';
  }
  function renderInvites(){
    const panel=$('incoming-invites'),now=Date.now();for(const [id,v]of invitations)if(v.expires<=now)invitations.delete(id);
    panel.hidden=!getAccount()||!!getState()||!invitations.size;if(panel.hidden){inviteKey='';return;}const key=[...invitations.keys()].join();if(key===inviteKey)return;inviteKey=key;panel.replaceChildren();
    for(const v of invitations.values()){const card=document.createElement('article'),title=document.createElement('b'),description=document.createElement('p'),actions=document.createElement('div');title.textContent=v.fromName+' 님의 초대';description.textContent=v.roomName+' · '+v.code;actions.className='invitation-actions';
      for(const accept of [true,false]){const b=document.createElement('button');b.type='button';b.textContent=accept?'초대 수락':'거절';b.onclick=async()=>{b.disabled=true;try{await request(accept?'social:accept':'social:decline',{id:v.id});invitations.delete(v.id);renderInvites();}catch(e){notify(e.message);invitations.delete(v.id);renderInvites();}};actions.append(b);}card.append(title,description,actions);panel.append(card);}
  }
  function update(){renderPeople();renderTeams();renderChat();renderInvites();}
  socket.on('social:presence',list=>{people.clear();for(const p of list)people.set(p.id,p);update();});
  socket.on('social:state',value=>{if(value.scope!==chatState.scope){chatKeys.main='';chatKeys.room='';$('main-chat-log').replaceChildren();$('room-chat-log').replaceChildren();}chatState=value;renderChat();});
  socket.on('social:invite',value=>{if(invitations.size>=5){const old=invitations.keys().next().value;invitations.delete(old);}invitations.set(value.id,value);renderInvites();});
  socket.on('disconnect',()=>{people.clear();invitations.clear();presenceKey='';update();});
  for(const input of [$('main-chat-input'),$('room-chat-input')]){input.addEventListener('focus',clearInput);input.addEventListener('keydown',e=>e.stopPropagation());}
  setInterval(renderInvites,1000);
  return {update};
}
