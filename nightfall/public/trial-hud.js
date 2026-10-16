import {icon} from './hud-icons.js';
import {ITEM_NAMES,ITEM_CAPACITY,STATE_NAMES,clamp,healthState,healthLabel,actionTempo,perkState,effectList,hookProgress,visibleActivities} from './hud-model.js';
import {ACTIVITY_LABELS} from './team-hud.js';
const PERK_ICONS={engineer:'generator',medic:'heal',sprinter:'sprint',breaker:'toolbox',tracker:'eye',patrol:'chase'};
const INTENTS=['수리할게요','구출하러 가요','치료가 필요해요','살인마가 근처예요','출구로 가요','도와주세요','고마워요','좋아요'];
const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;};
export function createTrialHud({socket,getState,getMyId,clearInput,notify}){
 const $=id=>document.getElementById(id);let openPanel=null,returnFocus=null,lastTeam='',lastPerks='',lastEffects='',lastDetails='',lastInventory='',lastObjective='',lastRoom=null,ping=null,wheelIndex=null,boundsDirty=true,bounds=[];
 const prefs={scale:100,skill:100,names:true,tips:false,intents:true,...read('nightfall-hud-options',{})},muted=new Set(read('nightfall-intent-muted',[]));
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
 prefs.scale=Math.max(70,Math.min(120,Number(prefs.scale)||100));prefs.skill=Math.max(70,Math.min(140,Number(prefs.skill)||100));
 function applyPrefs(){document.documentElement.style.setProperty('--trial-scale',prefs.scale/100);$('hud').classList.toggle('hide-player-names',!prefs.names);$('hud').classList.toggle('show-key-hints',!!prefs.tips);$('hud-scale-value').textContent=prefs.scale+'%';$('skill-scale-value').textContent=prefs.skill+'%';try{localStorage.setItem('nightfall-hud-options',JSON.stringify(prefs));}catch{}}
 for(const [id,key]of [['hud-scale','scale'],['skill-scale','skill']]){$(id).value=prefs[key];$(id).oninput=()=>{prefs[key]=Number($(id).value);applyPrefs();};}
 for(const [id,key]of [['hud-names','names'],['hud-tips','tips'],['hud-intents','intents']]){$(id).checked=prefs[key];$(id).onchange=()=>{prefs[key]=$(id).checked;applyPrefs();lastTeam='';};}applyPrefs();
 const current=()=>{const s=getState();return {s,own:s?.players.find(p=>p.id===getMyId())};};
 function close(){if(!openPanel)return;$(openPanel).hidden=true;openPanel=null;clearInput();if(returnFocus?.isConnected)returnFocus.focus();}
 function open(id){close();returnFocus=document.activeElement;openPanel=id;$(id).hidden=false;clearInput();($(id).querySelector('h2')||$(id).querySelector('button'))?.focus();}
 $('match-details-open').onclick=()=>{updateDetails();open('match-details');};$('hud-settings-open').onclick=()=>open('hud-settings');
 for(const id of ['match-details-close','hud-settings-close','intent-close'])$(id).onclick=close;
 function sendIntent(index){const {s,own}=current();if(!prefs.intents||s?.phase!=='playing'||own?.role!=='survivor'||['out','escaped'].includes(own?.status))return;socket.timeout(3000).emit('intent',{index},(err,r)=>{if(err||!r?.ok)notify(r?.error||'메시지 전송에 실패했습니다.');});close();}
 INTENTS.forEach((text,i)=>{const b=make('button','intent-choice');b.type='button';b.append(make('kbd','',String(i+1)),make('span','',text));b.onpointerenter=()=>{wheelIndex=i;};b.onfocus=()=>{wheelIndex=i;};b.onclick=()=>sendIntent(i);$('intent-options').append(b);});
 function openWheel(){const {s,own}=current();if(openPanel||!prefs.intents||s?.phase!=='playing'||own?.role!=='survivor'||['out','escaped'].includes(own.status))return;wheelIndex=null;open('intent-wheel');}
 $('intent-open').onclick=openWheel;
 addEventListener('keydown',e=>{
   if(openPanel){if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
     if(openPanel==='intent-wheel'&&/^Digit[1-8]$/.test(e.code)){e.preventDefault();e.stopImmediatePropagation();sendIntent(Number(e.code.slice(-1))-1);return;}
     if(e.code==='Tab'){const controls=[...$(openPanel).querySelectorAll('button,input,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden),first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement.tagName==='H2')){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
     e.stopImmediatePropagation();return;
   }
   if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)||!$('guide').hidden||!$('result').hidden)return;
   if(e.code==='Tab'&&getState()?.phase==='playing'){e.preventDefault();e.stopImmediatePropagation();updateDetails();open('match-details');}
   if(e.code==='KeyC'&&!e.repeat){openWheel();if(openPanel)e.preventDefault();}
 },true);
 addEventListener('keyup',e=>{if(e.code==='KeyC'&&openPanel==='intent-wheel'){if(wheelIndex!==null)sendIntent(wheelIndex);else close();}},true);
 $('game').addEventListener('pointerdown',e=>{if(e.button===1){e.preventDefault();openWheel();}});
 addEventListener('pointerup',e=>{if(e.button===1&&openPanel==='intent-wheel'){if(wheelIndex!==null)sendIntent(wheelIndex);else close();}});
 $('game').addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 addEventListener('blur',()=>{if(openPanel==='intent-wheel')close();});
 function ring(type,progress,label){const box=make('span','trial-ring');box.style.setProperty('--progress',clamp(progress)*100+'%');box.append(icon(type));box.title=label;box.setAttribute('aria-label',label);return box;}
 function meter(label,value,cls){const box=make('div','trial-meter '+cls),fill=make('i');box.title=label;box.setAttribute('role','progressbar');box.setAttribute('aria-label',label);box.setAttribute('aria-valuemin','0');box.setAttribute('aria-valuemax','100');box.setAttribute('aria-valuenow',String(Math.round(clamp(value)*100)));fill.style.transform=`scaleX(${clamp(value)})`;box.append(fill);return box;}
 function updateTeam(s,own){
   const team=s.players.filter(p=>p.role==='survivor'),key=JSON.stringify([team.map(p=>[p.id,p.name,p.status,p.health,p.hookStage,p.deathKind,Math.ceil(p.hookTime),Math.round(p.resolve*100),Math.round(p.bleed),p.connected,p.bot,p.teamActivity?[p.teamActivity.type,Math.round((p.teamActivity.progress??-1)*100),p.teamActivity.chased]:null,p.id===s.viewId,s.intents?.filter(m=>m.playerId===p.id&&!muted.has(p.id)).map(m=>m.id)]),prefs.names,prefs.intents,s.chaseId]);if(key===lastTeam)return;lastTeam=key;
   $('team-count').textContent=`${team.filter(p=>!['out','escaped'].includes(p.status)).length}/${team.length}`;
   $('team').replaceChildren(...team.map(p=>{
     const state=healthState(p),row=make('div',`trial-player ${state}${p.status==='out'?' out':''}${s.viewId===p.id?' watched':''}`),portrait=make('span','trial-portrait'),body=make('div','trial-player-body');
     portrait.append(icon(state==='caged'?'hook':state==='alive'?'person':state));portrait.setAttribute('aria-label',healthLabel(p));
     if(p.teamActivity?.chased||s.chaseId===p.id){portrait.classList.add('chased');portrait.append(make('span','chase-claws','⌜ ⌝'));}
     const n=make('b','trial-player-name',p.name+(p.id===own.id?' · 나':''));n.title=p.name;body.append(n);
     body.append(make('small','trial-health',healthLabel(p)));
     if(p.hookStage!==null){const marks=make('span','trial-hook-marks');for(let i=0;i<2;i++){const m=make('i');m.classList.toggle('used',i<p.hookStage);marks.append(m);}marks.title=`누적 갈고리 ${p.hookStage}/3`;marks.setAttribute('aria-label',marks.title);body.append(marks);}
     if(p.bot||!p.connected)body.append(make('small','trial-bot',p.bot?'BOT':'재접속 중'));
     const hp=hookProgress(p,s.config);
     if(p.status==='caged'){
       body.append(make('strong','trial-hook-stage',p.hookStage===null?'갈고리':`${p.hookStage}단계 · ${Math.ceil(p.hookTime)}초`),meter('희생 단계 남은 시간',hp.sacrifice,'sacrifice'));
       if(own.role==='survivor')body.append(make('small','resolve-label','캠핑 방지 '+Math.round(hp.resolve*100)+'%'),meter('캠핑 방지 Resolve',hp.resolve,'resolve'));
     }else if(p.status==='down')body.append(meter('출혈까지 남은 시간',hp.bleed,'bleed'));
     const a=visibleActivities(p);if(a){const type=a.type==='repair'?'generator':a.type==='sabotage'?'toolbox':['selfHeal','mend','rescue'].includes(a.type)?'heal':a.type==='recover'?'down':a.type==='gate'?'escaped':a.type;row.append(ring(type,a.progress,`${ACTIVITY_LABELS[a.type]}${a.progress===null?'':' '+Math.round(a.progress*100)+'%'}`));}
     if(prefs.intents&&!muted.has(p.id)){const message=s.intents?.filter(m=>m.playerId===p.id).at(-1);if(message)body.append(make('span','trial-intent-message',message.text));}
     row.prepend(portrait,body);return row;
   }));
 }
 function updatePerks(s,p){const key=JSON.stringify([p.id,p.perks,p.exhaustion&&Math.ceil(p.exhaustion),p.sprintBoost&&Math.ceil(p.sprintBoost),p.patrolBoost&&Math.ceil(p.patrolBoost)]);if(key===lastPerks)return;lastPerks=key;
   $('perk-grid').replaceChildren(...Array.from({length:4},(_,i)=>{const id=p.perks?.[i],perk=s.perks?.[id],b=make('button','trial-perk');b.type='button';b.setAttribute('aria-label',perk?perk.name+' · '+perk.description:'빈 특전 슬롯');b.title=b.getAttribute('aria-label');b.append(icon(PERK_ICONS[id]||'none'));if(!id){b.classList.add('empty');return b;}const ps=perkState(id,p);b.dataset.mode=ps.mode;b.style.setProperty('--remaining',ps.duration?clamp(ps.remaining/ps.duration)*100+'%':'0%');if(ps.remaining)b.append(make('span','perk-time',String(Math.ceil(ps.remaining))));b.onclick=()=>notify(perk.name+' · '+perk.description);return b;}));
 }
 function updateEffects(s,p){const effects=effectList(p,s.config),key=JSON.stringify(effects.map(e=>[e.id,Math.ceil(e.time||0)]));if(key===lastEffects)return;lastEffects=key;
   $('status-effects').replaceChildren(...effects.map(e=>{const b=make('button','trial-effect '+(e.buff?'buff':'debuff'));b.type='button';b.title=e.name+(e.time?' · '+Math.ceil(e.time)+'초':'');b.setAttribute('aria-label',b.title);b.append(icon(({endurance:'shield',haste:'sprint',elusive:'eye',exhaustion:'exhaustion',wound:'wound',stun:'clock',blind:'eye',hit:'sprint',sprint:'sprint',patrol:'chase',bloodlust:'killer'})[e.id]),make('small','',e.name));if(e.time)b.append(make('b','',Math.ceil(e.time)+'초'));b.onclick=()=>notify(b.title);return b;}));
 }
 function updateInventory(s,p){const charge=p.role==='killer'?clamp(1-p.cooldown/(p.recoveryDuration||s.config.attackCooldown)):clamp(p.itemCharge/(ITEM_CAPACITY[p.itemType]||1)),key=JSON.stringify([p.role,p.itemType,Math.ceil(p.itemCharge),Math.ceil(p.cooldown),Math.round(charge*100)]);if(key===lastInventory)return;lastInventory=key;
   const name=p.role==='killer'?'기본 공격':ITEM_NAMES[p.itemType]||'장비 없음',box=make('span','trial-item-icon');box.append(icon(p.role==='killer'?'killer':p.itemType));const text=make('div','trial-item-label');text.append(make('b','',name),make('small','',p.role==='killer'?(p.cooldown>0?`회복 ${p.cooldown.toFixed(1)}초`:'왼쪽 클릭 · 길게 런지'):p.itemType==='none'?'아이템을 찾아보세요':`${Math.ceil(p.itemCharge)}${['key','map'].includes(p.itemType)?'회':' 충전'} · Q`));$('inventory').replaceChildren(box,text,meter('장비 사용 가능량',charge,'item-charge'));
 }
 function updateDetails(){const {s,own}=current();if(!s||!own)return;const key=JSON.stringify([s.trial,s.players.map(p=>p.connected),[...muted]]);if(key===lastDetails)return;lastDetails=key;
   $('trial-killer-name').textContent=s.trial?.killerName||'살인마 미확인 · 첫 추격 또는 피격 후 공개';
   $('match-player-list').replaceChildren(...(s.trial?.players||[]).map(p=>{const row=make('article','match-player'),title=make('h3','',p.name+' · '+(p.role==='killer'?'살인마':'생존자'));row.append(title);if(p.loadout){row.append(make('p','',p.loadout.perks.length?p.loadout.perks.map(k=>s.perks[k]?.name||k).join(' · '):'장착 특전 없음'));for(const k of p.loadout.perks)row.append(make('small','match-perk-description',`${s.perks[k]?.name||k}: ${s.perks[k]?.description||''}`));row.append(make('p','',p.role==='killer'?'고유 능력 없음 · 기본 공격':ITEM_NAMES[p.loadout.item]||'장비 없음'));}else row.append(make('p','muted','상대편 장비는 경기 종료 후 공개됩니다.'));
     if(own.role==='survivor'&&p.role==='survivor'&&p.id!==own.id){const label=make('label','mute-intent'),input=make('input');input.type='checkbox';input.checked=muted.has(p.id);input.onchange=()=>{input.checked?muted.add(p.id):muted.delete(p.id);try{localStorage.setItem('nightfall-intent-muted',JSON.stringify([...muted].slice(-64)));}catch{}lastTeam='';};label.append(input,document.createTextNode('빠른 메시지 숨기기'));row.append(label);}return row;}));
 }
 function update(s,myId){
   boundsDirty=true;
   const own=s?.players.find(p=>p.id===myId);if(!own||s.phase==='lobby'||s.phase==='loading'){if(openPanel)close();return;}
   if(lastRoom!==s.code){lastRoom=s.code;lastTeam=lastDetails=lastEffects=lastPerks=lastInventory=lastObjective='';}
   if(s.phase==='finished'&&openPanel)close();
   const p=s.players.find(p=>p.id===s.viewId)||own,spectating=['out','escaped'].includes(own.status);$('hud').dataset.role=p.role;$('hud').classList.toggle('spectating',spectating);updateTeam(s,own);updatePerks(s,p);updateEffects(s,p);updateInventory(s,p);
   const remaining=Math.max(0,s.generatorGoal-s.map.generators.filter(g=>g.progress>=s.config.generatorSeconds).length);const objectiveKey=s.powered+':'+remaining;if(lastObjective!==objectiveKey){lastObjective=objectiveKey;$('objective-text').replaceChildren(icon(s.powered?'escaped':'generator'),make('b','',s.powered?'탈출':' '+remaining),make('small','',s.powered?'출구를 여세요':'남은 발전기'));}
   $('spectator-banner').hidden=!spectating;$('spectator-name').textContent=spectating?p.name:'';
   $('intent-open').hidden=!prefs.intents||spectating||own.role!=='survivor';
   const end=s.endgame;$('endgame').hidden=end===null;if(end!==null){const slowed=s.players.some(p=>p.status==='down'||p.status==='caged');$('endgame-fill').style.transform=`scaleX(${clamp(end/s.config.endgameSeconds)})`;$('endgame').classList.toggle('slowed',slowed);$('endgame').classList.toggle('urgent',end<30);$('endgame-label').textContent=`종반 붕괴 · ${Math.ceil(end)}초${slowed?' · 느리게 진행 중':''}`;$('endgame').setAttribute('aria-valuenow',String(Math.ceil(end)));}
   const tempo=actionTempo(own.action?.speed??1);$('action-track').dataset.tempo=tempo;$('action-speed').hidden=!own.action;$('action-speed').textContent=own.action?(tempo==='fast'?'» 빠름':tempo==='slow'?'› 느림':'› 정상'):'';
   if(['carried','caged'].includes(p.status))$('action-speed').hidden=true;
   if(openPanel==='match-details')updateDetails();
 }
 function frame(){const s=getState();if(!s?.intents?.length||s.phase!=='playing')return;const visible=s.intents.filter(m=>m.until>s.elapsed);if(visible.length!==s.intents.length){s.intents=visible;lastTeam='';update(s,getMyId());}}
 const pingTimer=setInterval(()=>{if(socket.connected&&getState()?.phase==='playing'){const start=performance.now();socket.timeout(2500).emit('ping:trial',{},(err)=>{ping=err?null:Math.round(performance.now()-start);$('network-quality').textContent=err?'연결 지연':ping+'ms';$('network-quality').classList.toggle('network-poor',err||ping>180);});}},5000);pingTimer.unref?.();
 const readBounds=()=>{if(boundsDirty){boundsDirty=false;bounds=['.team-panel','.objective','.inventory-panel','#perk-grid','#status-effects','.interaction','.hud-controls','#chat-window','#endgame'].map(sel=>document.querySelector(sel)).filter(el=>el&&!el.hidden).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}));}return bounds;};
 addEventListener('resize',()=>boundsDirty=true);new MutationObserver(()=>boundsDirty=true).observe($('chat-window'),{attributes:true,attributeFilter:['style','hidden']});
 return {update,frame,close,get markerBounds(){return readBounds();},get modalOpen(){return !!openPanel;},get skillScale(){return prefs.skill/100;}};
}
