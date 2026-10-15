import { randomUUID } from 'node:crypto';
import { CONFIG as C } from './config.js';
import { SurvivorBots } from './bots.js';
import { attackRecoveryMultiplier, skillProfile, campRate, ITEMS, repairSkillChance } from './rules.js';
import { createMap } from './map.js';
export { createMap } from './map.js';
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function terrorCue(phase,view,killer){
  if(phase!=='playing'||view?.role!=='survivor'||!['alive','down','caged','carried'].includes(view.status)||killer?.status!=='alive')return {strength:0,direction:null};
  const d=distance(view,killer),strength=Math.max(0,1-d/C.terrorRadius);
  return {strength,direction:d<16*C.pixelsPerMeter?((Math.round(Math.atan2(killer.y-view.y,killer.x-view.x)/(Math.PI/4))+8)%8):null};
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function intersects(x,y,r,w){return Math.hypot(x-clamp(x,w.x,w.x+w.w),y-clamp(y,w.y,w.y+w.h))<r;}
export function lineOfSight(map,a,b){const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y),walls=map.walls.filter(w=>w.x<=maxX&&w.x+w.w>=minX&&w.y<=maxY&&w.y+w.h>=minY);const steps=Math.ceil(distance(a,b)/10);for(let i=1;i<steps;i++){const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;if(walls.some(w=>x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h))return false;}return true;}
export const PERKS={engineer:{role:'survivor',name:'정비 숙련',description:'수리 속도 +5%'},medic:{role:'survivor',name:'응급 처치',description:'치료 속도 +15%'},sprinter:{role:'survivor',name:'생존 본능',description:'달리기 시작 시 3초간 +50%, 탈진 40초'},breaker:{role:'killer',name:'철거 숙련',description:'파레트 파괴 속도 +15%'},tracker:{role:'killer',name:'끈질긴 추적',description:'달리기 흔적 수명 +4초'},patrol:{role:'killer',name:'야간 순찰',description:'갈고리에 건 뒤 8초간 이동 +10%'}};
const idle=()=>({x:0,y:0,space:false,work:false,run:false,crouch:false,attack:false,item:false,self:false,drop:false,aimX:1,aimY:0});
const active=p=>!['out','escaped'].includes(p.status);
const has=(p,key)=>p.perks.includes(key);
export class Room {
  constructor(code,name,maxPlayers=C.defaultPlayers){this.code=code;this.name=name;this.maxPlayers=clamp(maxPlayers,3,C.maxPlayers);this.players=new Map();this.hostId=null;this.phase='lobby';this.map=createMap();this.events=[];this.elapsed=0;this.result=null;this.updatedAt=Date.now();this.generatorGoal=C.generatorGoal;this.endgame=null;this.traces=[];this.noises=[];this.random=Math.random;this.bots=new SurvivorBots(this);}
  fresh(){return {lastInputAt:null,hitSequence:0,lastHitAt:null,status:'alive',health:2,cageCount:0,hookStage:0,hookTime:0,resolve:0,campTime:0,disconnectTime:0,stun:0,immunity:0,deepWound:0,mend:0,hitBoost:0,exhaustion:0,sprintBoost:0,patrolBoost:0,carrying:null,hidden:null,action:null,task:null,input:idle(),previous:idle(),pendingPress:new Set(),skill:null,nextSkill:1,wiggle:0,wiggleActive:false,recovery:0,bleed:0,cooldown:0,attackTimer:0,swing:0,flashBlind:0,blindProgress:0,selfAttempts:0,bloodlust:0,chaseTime:0,vault:null,vaultCounts:{},facing:{x:1,y:0},spectateId:null,scratchTimer:0,bloodTimer:0,healProgress:0,hookedAt:null,haste:0,elusive:0,attackState:null,recoveryKind:null,recoveryDuration:0,moveSpeed:0,runDistance:0,lastMove:{x:0,y:0},chaseTarget:null,chaseLost:0,missedHookChecks:0,afkTime:0,crows:0,wiggleStrength:.5,lockerTransition:null,bot:false,skillRoll:1,lockerTime:0,afkOrigin:null,lastCrow:0,pickupBy:null,palletDrop:null,repairRolls:0};}
  addPlayer(name,role=null){if(this.phase!=='lobby')throw new Error('이미 시작된 방입니다.');if(this.players.size>=this.maxPlayers)throw new Error('방이 가득 찼습니다.');const p={id:randomUUID(),name,role:role||(this.players.size?'survivor':'killer'),x:0,y:0,connected:true,perks:[],itemType:'medkit',itemCharge:24,...this.fresh()};this.players.set(p.id,p);this.hostId??=p.id;return p;}
  setRole(id,role){if(this.phase!=='lobby')throw new Error('경기 중에는 진영을 변경할 수 없습니다.');const p=this.players.get(id);if(!p||!['killer','survivor','waiting'].includes(role))throw new Error('진영을 확인해주세요.');if(role==='killer'&&[...this.players.values()].some(q=>q.id!==id&&q.role==='killer'))throw new Error('살인마 자리가 차 있습니다. 자리가 비면 이동할 수 있습니다.');if(p.role!==role){p.role=role;p.perks=[];}}
  loadout(id,data){if(this.phase!=='lobby')throw new Error('대기실에서만 장비를 바꿀 수 있습니다.');const p=this.players.get(id);if(!p)return;if(p.role==='waiting')throw new Error('먼저 진영을 선택해주세요.');const perks=data?.perks;if(!Array.isArray(perks)||perks.length>4||new Set(perks).size!==perks.length||perks.some(k=>PERKS[k]?.role!==p.role))throw new Error('역할에 맞는 특전을 최대 4개 선택하세요.');if(!Object.keys(ITEMS).includes(data?.item))throw new Error('아이템을 확인해주세요.');p.perks=[...perks];p.itemType=p.role==='survivor'?data.item:'none';}
  start(id){if(id!==this.hostId)throw new Error('방장만 게임을 시작할 수 있습니다.');if(this.phase!=='lobby')throw new Error('게임이 이미 진행 중입니다.');const list=[...this.players.values()];if(list.some(p=>p.role==='waiting'))throw new Error('모든 참가자가 진영을 선택해야 합니다.');if(list.filter(p=>p.role==='killer'&&p.connected).length!==1)throw new Error('살인마는 정확히 1명이어야 합니다.');const n=list.filter(p=>p.role==='survivor').length;if(n<C.minSurvivors)throw new Error('생존자는 최소 2명이 필요합니다.');if(list.some(p=>!p.connected))throw new Error('접속이 끊긴 참가자가 있습니다.');this.map=createMap();this.generatorGoal=n<4?n+1:5;this.map.generators=this.map.generators.slice(0,n<4?n+3:C.generatorCount);this.phase='playing';this.elapsed=0;this.events=[];this.result=null;this.endgame=null;this.traces=[];this.noises=[];let i=0;for(const p of list){const spawn=p.role==='killer'?this.map.killerSpawn:this.map.spawns[i++%this.map.spawns.length];Object.assign(p,this.fresh(),spawn,{itemCharge:p.role==='killer'?0:ITEMS[p.itemType]?.charge||0,itemType:p.role==='killer'?'none':p.itemType});}this.event(`추격 시작 · 발전기 ${this.generatorGoal}개를 수리하세요.`);}
  event(text){this.events.push({id:randomUUID(),text,time:this.elapsed});this.events=this.events.slice(-8);}
  noise(p,text){this.noises.push({id:randomUUID(),x:p.x,y:p.y,text,expires:this.elapsed+5});}
  powered(){return this.map.generators.filter(g=>g.progress>=C.generatorSeconds).length>=this.generatorGoal;}
  near(p,list,r=C.interactionRadius){return list.filter(o=>distance(p,{x:o.x+(o.w||0)/2,y:o.y+(o.h||0)/2})<r&&lineOfSight(this.map,p,{x:o.x+(o.w||0)/2,y:o.y+(o.h||0)/2})).sort((a,b)=>distance(p,a)-distance(p,b))[0];}
  free(x,y,r=C.playerRadius){return x>=r&&y>=r&&x<=this.map.width-r&&y<=this.map.height-r&&![...this.map.walls,...this.map.windows,...this.map.pallets.filter(p=>p.state==='dropped')].some(w=>intersects(x,y,r,w));}
  placeBeside(p,origin,offset=45){
    for(const [dx,dy]of [[offset,0],[-offset,0],[0,offset],[0,-offset],[offset,offset],[-offset,offset],[offset,-offset],[-offset,-offset],[0,0]]){
      if(this.free(origin.x+dx,origin.y+dy)){p.x=origin.x+dx;p.y=origin.y+dy;return;}
    }
  }
  carry(k,p){
    for(const l of this.map.cabinets)if(l.occupant===p.id)l.occupant=null;
    p.hidden=null;p.lockerTransition=null;p.vault=null;p.pickupBy=null;p.task=null;p.action=null;p.skill=null;p.palletDrop=null;
    p.status='carried';p.health=0;p.wiggleActive=true;p.recovery=0;p.healProgress=0;p.deepWound=0;p.hitBoost=0;p.moveSpeed=0;k.carrying=p.id;
  }
  dropItem(p){if(p.itemType==='none')return;this.map.items??=[];this.map.items.push({id:randomUUID(),x:p.x+20,y:p.y,type:p.itemType,charge:p.itemCharge});p.itemType='none';p.itemCharge=0;}
  updateAmbient(p,dt){
    p.mapReading=false;
    if(p.lockerTransition){const t=p.lockerTransition;t.remaining-=dt;
      if(t.remaining<=0){const l=this.map.cabinets.find(l=>l.id===t.id);if(l&&t.type==='enter'&&p.status==='alive'){p.hidden=l.id;p.x=l.x;p.y=l.y;}else if(l){l.occupant=null;p.hidden=null;this.placeBeside(p,l,36);}p.lockerTransition=null;}
    }
    if(p.status!=='alive'||p.role!=='survivor'){p.crows=0;p.afkTime=0;return;}
    if(p.afkOrigin&&distance(p,p.afkOrigin)>64||p.action&&p.action.label!=='캐비넷'){
      p.afkTime=0;p.afkOrigin={x:p.x,y:p.y};p.crows=0;
    }else{p.afkOrigin??={x:p.x,y:p.y};p.afkTime+=dt;p.crows=p.afkTime>=120?3:p.afkTime>=100?2:p.afkTime>=80?1:0;
      if(p.crows>=3&&this.elapsed-p.lastCrow>=5){this.noise(p,'까마귀');p.lastCrow=this.elapsed;}}
  }
  conspicuous(p){p.immunity=0;p.elusive=0;}
  dropCarried(k,escape=false){
    const p=this.players.get(k.carrying);if(!p)return;
    if(!escape){p.wiggle=Math.min(C.wiggleSeconds,p.wiggle+C.wiggleSeconds*.25);escape=p.wiggle>=C.wiggleSeconds;}
    p.status=escape?'alive':'down';p.health=escape?1:0;p.wiggleActive=false;p.skill=null;
    p.x=k.x-35*k.facing.x;p.y=k.y-35*k.facing.y;
    if(!this.free(p.x,p.y)){p.x=k.x;p.y=k.y;}
    if(escape){p.wiggle=0;k.stun=3;}
    k.carrying=null;
  }
  eliminate(p,reason){if(!active(p))return;if(p.carrying)this.dropCarried(p);for(const k of this.players.values())if(k.carrying===p.id)k.carrying=null;for(const h of this.map.cages)if(h.occupant===p.id){h.occupant=null;h.rescueProgress=0;h.availableUntil=this.elapsed+60;}for(const l of this.map.cabinets)if(l.occupant===p.id)l.occupant=null;p.hidden=null;p.status='out';p.skill=null;p.vault=null;this.event(`${p.name} · ${reason}`);}
  damage(p){
    if(p.status!=='alive'||p.hidden)return false;
    p.hitSequence++;p.lastHitAt=this.elapsed;
    if(p.lockerTransition){for(const l of this.map.cabinets)if(l.occupant===p.id)l.occupant=null;p.lockerTransition=null;}
    p.hitBoost=C.hitBoostSeconds;p.moveSpeed=C.hitBoostSpeed;p.recovery=0;p.healProgress=0;p.mend=0;p.action=null;p.task=null;p.skill=null;
    if(p.immunity>0&&p.health===1&&!p.deepWound){p.deepWound=20;p.immunity=0;return true;}
    p.health--;
    if(p.health<=0){p.health=0;p.status='down';p.deepWound=0;p.hitBoost=0;p.vault=null;this.event(`${p.name} 빈사 상태`);}else this.noise(p,'비명');
    return true;
  }
  attack(k){
    if(k.task||k.stun||k.cooldown||k.vault||k.attackState||k.status!=='alive')return;
    k.attackState={phase:'charge',elapsed:0};k.swing=.35;
  }
  finishAttack(k,kind){k.attackState=null;k.attackTimer=0;k.recoveryKind=kind;k.recoveryDuration=kind==='hit'?C.attackCooldown:C.attackMissCooldown;k.cooldown=k.recoveryDuration;}
  resolveAttack(k){
    if(k.task||k.stun||k.vault||k.status!=='alive')return false;
    const candidates=[...this.players.values()].filter(p=>p.id!==k.carrying&&p.role==='survivor'&&p.status==='alive'&&!p.hidden&&distance(k,p)<=C.attackRange&&lineOfSight(this.map,k,p)).sort((a,b)=>distance(k,a)-distance(k,b));
    for(const p of candidates){const d=Math.max(1,distance(k,p));
      if((distance(k,p)<20||((p.x-k.x)*k.facing.x+(p.y-k.y)*k.facing.y)/d>=.45)&&!this.map.pallets.some(q=>q.state==='dropped'&&segmentRect(k,p,q))){
        if(p.vault&&p.health===1&&!k.carrying){this.carry(k,p);}
        else if(!this.damage(p))continue;
        this.finishAttack(k,'hit');k.chaseTime=0;k.bloodlust=0;return true;
      }
    }return false;
  }
  combat(k,dt){
    if(k.stun||k.vault||k.task){k.attackState=null;return;}
    const a=k.attackState;if(!a)return;a.elapsed+=dt;
    if(a.phase==='charge'){
      if(!k.input.attack&&a.elapsed>=.18){if(!this.resolveAttack(k))this.finishAttack(k,'miss');}
      else if(a.elapsed>=.3){a.phase='lunge';a.elapsed=0;}
    }else if(this.resolveAttack(k))return;
    else if(a.elapsed>=.5)this.finishAttack(k,'miss');
  }
  move(p,dt){
    if(!['alive','down'].includes(p.status)||p.stun||p.hidden||p.vault||p.lockerTransition||p.pickupBy||p.palletDrop||p.task&&(p.input.work||p.input.space||p.input.self)){p.moveSpeed=0;p.runDistance=0;return;}
    let {x,y}=p.input;const killer=p.role==='killer',lunge=killer&&p.attackState?.phase==='lunge';
    if(lunge){x=p.facing.x;y=p.facing.y;}
    if(killer&&p.carrying&&(x||y)){const q=this.players.get(p.carrying),sway=Math.sin(this.elapsed*4)*(q?.wiggleStrength||.25)*.25;x-=p.facing.y*sway;y+=p.facing.x*sway;}
    const len=Math.hypot(x,y);if(!len){p.moveSpeed=0;p.runDistance=0;return;}if(len>1){x/=len;y/=len;}
    let speed=killer?C.survivorSpeed*C.killerSpeedMultiplier:p.status==='down'?C.crawlSpeed:p.input.crouch?C.crouchSpeed:p.input.run?C.survivorSpeed:C.walkSpeed;
    if(killer&&p.carrying)speed=C.survivorSpeed*.92;
    if(killer&&p.bloodlust&&!p.carrying&&!lunge)speed+=p.bloodlust*8.5;
    if(killer&&p.cooldown>0)speed*=attackRecoveryMultiplier(p.recoveryKind||'hit',p.cooldown,p.recoveryDuration||C.attackCooldown);
    if(lunge)speed=6.9*C.pixelsPerMeter;
    if(!killer&&p.status==='alive'){
      let haste=(p.sprintBoost>0?.5:0)+(p.haste>0?.1:0);
      speed*=1+haste;if(p.hitBoost>0)speed=Math.max(speed,C.hitBoostSpeed);
    }
    if(p.patrolBoost>0)speed*=1.1;
    // Survivor acceleration; recovery/lunge curves are authored directly for killers.
    if(!killer&&p.status==='alive'&&!p.hitBoost){p.moveSpeed=Math.min(speed,(p.moveSpeed||0)+10*C.pixelsPerMeter*dt);speed=p.moveSpeed;}else p.moveSpeed=speed;
    const blockers=[...this.map.walls,...this.map.windows,...this.map.pallets.filter(q=>q.state==='dropped')];
    const bodies=[...this.players.values()].filter(q=>q.id!==p.id&&q.status==='alive'&&!q.hidden&&!q.vault&&!q.elusive&&!q.immunity&&!p.immunity&&!p.elusive);
    const start={x:p.x,y:p.y},dx=x*speed*dt,dy=y*speed*dt,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/10));
    const bodyBlocked=(nx,ny)=>bodies.some(q=>Math.hypot(nx-q.x,ny-q.y)<C.playerRadius*2&&Math.hypot(nx-q.x,ny-q.y)<distance(p,q)-1e-6);
    for(let i=0;i<steps;i++){
      const nx=clamp(p.x+dx/steps,C.playerRadius,this.map.width-C.playerRadius),ny=clamp(p.y+dy/steps,C.playerRadius,this.map.height-C.playerRadius);
      if(!blockers.some(w=>intersects(nx,p.y,C.playerRadius,w))&&!bodyBlocked(nx,p.y))p.x=nx;
      if(!blockers.some(w=>intersects(p.x,ny,C.playerRadius,w))&&!bodyBlocked(p.x,ny))p.y=ny;
    }
    if(lunge&&distance(p,start)<speed*dt*.3)this.finishAttack(p,'obstructed');
    if(!killer)p.facing={x:x/Math.hypot(x,y),y:y/Math.hypot(x,y)};
    const travelled=distance(p,start),running=!killer&&p.status==='alive'&&p.input.run&&!p.input.crouch;
    p.runDistance=running&&p.lastMove.x*x+p.lastMove.y*y>.9?p.runDistance+travelled:running?travelled:0;p.lastMove={x,y};
    if(running&&travelled>.01&&!p.elusive){p.scratchTimer+=dt;if(p.scratchTimer>=.22){p.scratchTimer%=.22;const k=[...this.players.values()].find(q=>q.role==='killer');const trace={x:p.x,y:p.y,type:'scratch',created:this.elapsed,expires:this.elapsed+C.scratchSeconds+(has(k,'tracker')?4:0)};this.traces.push(trace);const wall=this.map.walls.find(w=>intersects(p.x,p.y,55,w));if(wall)this.traces.push({...trace,x:clamp(p.x,wall.x,wall.x+wall.w),y:clamp(p.y,wall.y,wall.y+wall.h)});}}
  }
  beginSkill(p,type,target){if(p.skill)return;p.skill={type,target,start:this.elapsed+(type==='wiggle'?0:.65),...skillProfile(type,this.random)};}
  rollSkill(p,type,target,dt,chance){
    p.nextSkill-=dt;if(p.nextSkill>0||p.skill)return;
    p.nextSkill=1;if(type==='repair')p.repairRolls++;const g=type==='repair'?this.map.generators.find(g=>g.id===target):null,limit=g?Math.max(3,Math.round(6-3*g.progress/C.generatorSeconds)):Infinity;if(this.random()<chance||p.repairRolls>=limit){this.beginSkill(p,type,target);if(type==='repair')p.repairRolls=0;}
  }
  skill(p,missed=false){
    const s=p.skill;if(!s)return;
    const raw=clamp((this.elapsed-s.start)/s.duration,0,1),t=s.pingPong?1-Math.abs(1-raw*2):raw;
    const good=!missed&&(s.type==='wiggle'?(t>=.045&&t<=.205||t>=.795&&t<=.955):t>=s.good[0]&&t<=s.good[1]),great=good&&(s.type==='wiggle'?(Math.abs(t-.125)<.03||Math.abs(t-.875)<.03):t>=s.great[0]&&t<=s.great[1]);
    if(s.type==='repair'){
      const g=this.map.generators.find(g=>g.id===s.target);
      if(g){if(good&&great&&distance(p,g)<C.interactionRadius&&lineOfSight(this.map,p,g))g.progress=clamp(g.progress+.9,0,C.generatorSeconds);
        if(!good){g.progress=Math.max(0,g.progress-9);p.cooldown=C.skillFailureSeconds;this.noise(g,'발전기 폭발');}}
    }
    if(s.type==='heal'){
      const target=this.players.get(s.target);
      if(target){const key=target.status==='down'?'recovery':'healProgress';
        if(great&&distance(p,target)<55&&lineOfSight(this.map,p,target))target[key]=Math.min(1,(target[key]||0)+.03);
        if(!good){target[key]=Math.max(0,(target[key]||0)-.1);p.cooldown=C.skillFailureSeconds;this.noise(p,'치료 실패');}}
    }
    if(s.type==='hook'){
      if(!good&&[...this.players.values()].filter(q=>q.role==='survivor'&&active(q)).length<=2){p.hookTime-=10;p.missedHookChecks=missed?p.missedHookChecks+1:0;if(p.missedHookChecks>=2)this.eliminate(p,'갈고리 포기');}
      else p.missedHookChecks=0;
    }
    if(s.type==='wiggle')p.wiggleStrength=great?1.2:good?.5:.25;
    p.skill=null;p.nextSkill=s.type==='hook'?6+this.random()*7:1;
  }
  interruptSkill(p){if(!p.skill||!['repair','heal'].includes(p.skill.type))return;const age=this.elapsed-(p.skill.start-.65);if(age<=.1)p.skill=null;else this.skill(p,true);}
  vault(p,o){
    if(p.vault||p.stun||p.carrying||p.cooldown||p.lockerTransition)return;
    const window=this.map.windows.includes(o),killer=p.role==='killer';if(killer&&!window)return;
    const entry=p.vaultCounts[o.id]||{count:0,blockedUntil:0};
    if(window&&!killer&&((o.blockedUntil||0)>this.elapsed||entry.blockedUntil>this.elapsed)){p.action={label:'창문이 봉쇄되었습니다',progress:0};return;}
    const cx=o.x+o.w/2,cy=o.y+o.h/2,vertical=o.axis==='x',side=vertical?(p.x<cx?-1:1):(p.y<cy?-1:1);
    const x=vertical?cx-side*(o.w/2+26):cx,y=vertical?cy:cy-side*(o.h/2+26);if(!this.free(x,y))return;
    const running=p.input.run&&!p.input.crouch,normal=vertical?Math.abs(p.facing.x):Math.abs(p.facing.y);
    const fast=running&&normal>.9&&p.runDistance>=2.5*C.pixelsPerMeter;
    const seconds=killer?1.7:window?(running?(fast?.5:.9):1.5):(running?1.1:2);
    p.vault={from:{x:p.x,y:p.y},to:{x,y},progress:0,seconds,id:o.id};p.runDistance=0;
    if(!killer&&running)this.noise(p,'급하게 넘기');
    if(window&&!killer){const k=[...this.players.values()].find(q=>q.role==='killer');if(k?.chaseTarget===p.id){entry.lastChase=this.elapsed;entry.count++;if(entry.count>=3){o.blockedUntil=this.elapsed+30;entry.blockedUntil=o.blockedUntil;entry.count=0;}p.vaultCounts[o.id]=entry;}}
  }
  task(p,key,label,seconds,dt,complete){if(p.task?.key!==key)p.task={key,progress:0};p.task.progress+=dt;p.action={label,progress:p.task.progress/seconds};if(p.task.progress>=seconds){p.task=null;complete();}}
  interact(p,dt,pressed){p.action=null;const keepTask=p.task;p.task=null;
    if(p.skill&&['repair','heal'].includes(p.skill.type)&&((!p.input.work&&!p.input.item)||p.input.x||p.input.y))this.interruptSkill(p);
    if(!active(p)){if(pressed){const list=[...this.players.values()].filter(active);p.spectateId=list[(list.findIndex(q=>q.id===p.spectateId)+1)%list.length]?.id||null;}return;}
    if(p.status==='carried'){p.action={label:'SPACE · 저항 스킬 체크',progress:p.wiggle/C.wiggleSeconds};return;}
    if(p.status==='caged'){p.action={label:`갈고리 ${p.hookStage}단계 · ${Math.ceil(p.hookTime)}초 / 캠핑 방지 ${Math.floor(p.resolve*100)}%`,progress:p.resolve};if(p.input.self&&(p.resolve>=1||p.hookStage===1&&p.selfAttempts<3&&[...this.players.values()].filter(q=>q.role==='survivor'&&active(q)).length<=2)){
      p.task=keepTask;this.task(p,'self-unhook','자력 구출 시도',1.5,dt,()=>{if(p.resolve>=1||this.random()<.04)this.unhook(p);else{p.selfAttempts++;p.hookTime-=20;this.event(p.name+' 자력 구출 실패 · 20초 감소');}});
    }return;}
    if(p.status==='down'){if(p.pickupBy){p.action={label:'살인마가 들어 올리는 중',progress:0};return;}if(!p.input.x&&!p.input.y&&p.recovery<.95)p.recovery=Math.min(.95,p.recovery+dt/32);p.action={label:`회복 ${Math.floor(p.recovery*100)}% · 동료의 도움이 필요합니다`,progress:p.recovery};return;}
    if(p.stun||p.vault||p.lockerTransition||p.palletDrop)return;
    if(p.hidden){if(pressed){const l=this.map.cabinets.find(l=>l.id===p.hidden);if(l){p.lockerTransition={remaining:p.input.run?.5:1.2,type:'exit',id:l.id};if(p.input.run)this.noise(p,'급하게 나오기');}}return;}
    const working=p.input.work||p.input.space&&!p.skill;
    if(p.role==='killer'){
      if(p.cooldown||p.attackState)return;
      if(p.input.self&&!p.carrying){const down=this.near(p,[...this.players.values()].filter(q=>q.role==='survivor'&&q.status==='down'),65);const others=[...this.players.values()].filter(q=>q.role==='survivor'&&q.id!==down?.id&&active(q));if(down&&(others.length===0)){p.task=keepTask;this.task(p,'mori','마지막 생존자 처형',3,dt,()=>{if(down.status==='down'){this.eliminate(down,'살인마 처형');}});return;}}
      if(p.input.drop&&!p.previous.drop&&p.carrying){this.dropCarried(p);return;}
      if(!working)return;p.task=keepTask;
      if(p.carrying){const h=this.near(p,this.map.cages.filter(h=>!h.occupant&&(h.availableUntil||0)<=this.elapsed));if(h)this.task(p,h.id,'갈고리에 걸기',1.5,dt,()=>{const q=this.players.get(p.carrying);p.carrying=null;q.cageCount++;q.hookStage++;q.hookTime=C.hookSeconds;q.hookedAt=this.elapsed;q.resolve=0;q.campTime=0;q.status='caged';q.health=1;q.wiggle=0;q.wiggleActive=false;q.recovery=0;q.healProgress=0;q.deepWound=0;q.skill=null;q.immunity=0;q.haste=0;q.elusive=0;for(const survivor of this.players.values())if(survivor.status==='caged')survivor.hookedAt=this.elapsed;q.x=h.x;q.y=h.y;h.occupant=q.id;if(q.hookStage>=3)this.eliminate(q,'갈고리 희생');else this.event(`${q.name} 갈고리 ${q.hookStage}단계`);if(has(p,'patrol'))p.patrolBoost=8;});else p.task=null;return;}
      const locked=this.players.get(keepTask?.key),down=locked?.status==='down'&&distance(p,locked)<65&&lineOfSight(this.map,p,locked)?locked:this.near(p,[...this.players.values()].filter(q=>q.status==='down'),65);if(down){down.pickupBy=p.id;this.task(p,down.id,'들어 올리기',C.pickupSeconds,dt,()=>{this.carry(p,down);});return;}
      const v=this.near(p,this.map.windows,62);if(v&&pressed){p.task=null;this.vault(p,v);return;}
      const pallet=this.near(p,this.map.pallets.filter(o=>o.state==='dropped'),70);if(pallet){this.task(p,pallet.id,'파레트 파괴',C.breakPalletSeconds/(has(p,'breaker')?1.15:1),dt,()=>{pallet.state='broken';p.chaseTime=0;p.bloodlust=0;this.event('파레트가 파괴되었습니다.');});pallet.breakProgress=p.task?.progress||0;return;}
      if(this.map.hatch.visible&&this.map.hatch.open&&distance(p,this.map.hatch)<65){this.task(p,'hatch','해치 닫기',.7,dt,()=>{this.map.hatch.open=false;this.startEndgame();this.event('해치가 닫혔습니다. 출구 스위치를 사용하세요.');});return;}
      const g=this.near(p,this.map.generators.filter(g=>![...this.players.values()].some(q=>q.role==='survivor'&&q.status==='alive'&&!q.hidden&&(q.input.work||q.input.item&&q.itemType==='toolbox')&&distance(q,g)<C.interactionRadius)&&g.progress>0&&g.progress<C.generatorSeconds&&!g.regressing&&g.regressionCount<8&&!g.workers.length));if(g){this.task(p,g.id,'발전기 손상',C.kickSeconds,dt,()=>{g.progress=Math.max(0,g.progress-4.5);g.regressing=true;g.repairToStop=0;g.regressionCount++;});return;}
      const l=this.near(p,this.map.cabinets,65);if(l){this.task(p,l.id,'캐비넷 수색',2,dt,()=>{if(l.occupant){const q=this.players.get(l.occupant);this.carry(p,q);this.event(`${q.name} 캐비넷에서 발각`);}});return;}
      const e=this.near(p,this.map.exits,70);if(e&&this.powered()&&!this.endgame&&!e.open)this.task(p,e.id,'탈출구 열기',.75,dt,()=>{e.open=true;e.progress=C.gateSeconds;this.startEndgame();});else p.task=null;return;
    }
    if(p.deepWound&&(working||p.input.item&&p.itemType==='medkit')){p.task=keepTask;this.task(p,'mend','깊은 상흔 치유',10,dt,()=>p.deepWound=0);return;}
    if(pressed&&!p.skill){
      const pal=this.near(p,this.map.pallets.filter(o=>o.state!=='broken'),65);if(pal){if(pal.state==='ready'){pal.state='falling';pal.dropStarted=this.elapsed;pal.dropAt=this.elapsed+C.palletDropSeconds;pal.dropOrigin={x:p.x,y:p.y};p.palletDrop={id:pal.id,until:pal.dropAt};}else if(pal.state==='dropped')this.vault(p,pal);return;}
      const v=this.near(p,this.map.windows,65);if(v){this.vault(p,v);return;}
      const l=this.near(p,this.map.cabinets.filter(l=>!l.occupant),55);if(l){l.occupant=p.id;p.lockerTransition={remaining:p.input.run?.5:1.2,type:'enter',id:l.id};if(p.input.run)this.noise(p,'급하게 숨기');return;}
    }
    if(p.input.drop&&!p.previous.drop){this.dropItem(p);return;}
    if(p.input.item&&p.itemType==='flashlight'&&p.itemCharge>0){p.itemCharge=Math.max(0,p.itemCharge-dt);p.flashlight=true;const k=[...this.players.values()].find(q=>q.role==='killer');if(k&&distance(p,k)<10*C.pixelsPerMeter&&lineOfSight(this.map,p,k)){const d=Math.max(1,distance(p,k));if(((k.x-p.x)*p.input.aimX+(k.y-p.y)*p.input.aimY)/d>.92&&(k.facing.x*(p.x-k.x)+k.facing.y*(p.y-k.y))/d>.3){k.blindProgress=(k.blindProgress||0)+dt;if(k.blindProgress>=1){k.flashBlind=2;this.dropCarried(k,true);k.blindProgress=0;}}}return;}
    if(p.input.item&&p.itemType==='map'&&p.itemCharge>0){p.itemCharge=Math.max(0,p.itemCharge-dt);p.mapReading=true;return;}
    if((p.input.x||p.input.y)||(!working&&!p.input.item))return;
    if(p.input.item&&p.itemType==='key'&&p.itemCharge>0&&this.map.hatch.visible&&!this.map.hatch.open&&distance(p,this.map.hatch)<55){p.task=keepTask;this.task(p,'unlock-hatch','열쇠로 해치 열기',2.5,dt,()=>{p.itemCharge=0;this.map.hatch.open=true;});return;}
    const ground=this.near(p,this.map.items||[],45);
    if(ground&&working&&(!p.previous.work||pressed)){this.dropItem(p);p.itemType=ground.type;p.itemCharge=ground.charge;this.map.items=this.map.items.filter(i=>i!==ground);return;}
    const totem=this.near(p,(this.map.totems||[]).filter(t=>!t.cleansed),55);
    if(totem&&working){this.conspicuous(p);p.task=keepTask;this.task(p,totem.id,'토템 정화',14,dt,()=>totem.cleansed=true);return;}
    const sabotage=this.near(p,this.map.cages.filter(h=>!h.occupant&&(h.availableUntil||0)<=this.elapsed),55);
    if(sabotage&&p.input.item&&p.itemType==='toolbox'&&p.itemCharge>=6){this.conspicuous(p);p.task=keepTask;this.task(p,sabotage.id,'갈고리 파괴',2.5,dt,()=>{p.itemCharge=Math.max(0,p.itemCharge-6);sabotage.availableUntil=this.elapsed+30;this.noise(sabotage,'갈고리 파괴');});return;}
    const h=this.near(p,this.map.cages.filter(h=>h.occupant));if(h&&working){this.conspicuous(p);h.rescuers.push(p.id);p.action={label:'동료 구출',progress:h.rescueProgress/C.rescueSeconds};return;}
    const friend=this.near(p,[...this.players.values()].filter(q=>q.id!==p.id&&q.role==='survivor'&&((q.status==='alive'&&q.health===1)||q.status==='down')&&!q.hidden&&!q.vault&&!q.pickupBy),55);
    if(friend&&(working||p.input.item&&p.itemType==='medkit'&&p.itemCharge>0)){if(p.cooldown)return;this.conspicuous(p);if(friend.deepWound)friend.receivingMend=true;p.action={label:friend.deepWound?'동료 상흔 치유':'동료 치료',progress:friend.status==='down'?friend.recovery:friend.healProgress||0};friend.healers.push(p.id);if(!friend.deepWound)this.rollSkill(p,'heal',friend.id,dt,p.input.item&&p.itemType==='medkit'?.15:.15);return;}
    if(p.input.item&&p.itemType==='medkit'&&p.health===1&&p.itemCharge>0){if(p.cooldown)return;this.conspicuous(p);this.rollSkill(p,'heal',p.id,dt,.125);const rate=(has(p,'medic')?1.15:1)/24;const used=Math.min(p.itemCharge,dt);p.healProgress+=rate*used;p.itemCharge=Math.max(0,p.itemCharge-used);p.action={label:'구급상자 자기 치료',progress:p.healProgress};if(p.healProgress>=1-1e-8){p.health=2;p.healProgress=0;}return;}

    const g=this.near(p,this.map.generators.filter(g=>g.progress<C.generatorSeconds));if(g&&!this.powered()&&this.endgame===null&&(working||p.input.item&&p.itemType==='toolbox')){if(p.cooldown)return;this.conspicuous(p);if(g.workers.length>=4)return;g.workers.push(p.id);p.action={label:'발전기 수리',progress:g.progress/C.generatorSeconds};this.rollSkill(p,'repair',g.id,dt,repairSkillChance(g.progress/C.generatorSeconds,p.input.item&&p.itemType==='toolbox'&&p.itemCharge>0));return;}
    const e=this.near(p,this.map.exits,70);if(e&&(this.powered()||this.endgame!==null)&&!e.open&&working){this.conspicuous(p);e.workers.push(p.id);p.action={label:'탈출구 개방',progress:e.progress/C.gateSeconds};return;}
    const ch=this.near(p,this.map.chests.filter(ch=>!ch.opened),60);if(ch&&working){this.conspicuous(p);p.task=keepTask;this.task(p,ch.id,'상자 열기',10,dt,()=>{ch.opened=true;this.dropItem(p);p.itemType=ch.item;p.itemCharge=ITEMS[ch.item]?.charge||0;});}
  }
  unhook(p){const h=this.map.cages.find(h=>h.occupant===p.id);if(h){h.occupant=null;h.rescueProgress=0;}p.status='alive';p.health=1;p.recovery=0;p.healProgress=0;p.deepWound=0;p.skill=null;p.immunity=C.releaseImmunitySeconds;p.resolve=0;this.placeBeside(p,p);p.haste=C.releaseImmunitySeconds;p.elusive=this.powered()?0:10;p.missedHookChecks=0;this.event(`${p.name} 구출 완료`);}
  startEndgame(){this.endgame??=C.endgameSeconds;}
  endTrial(id){
    const p=this.players.get(id);if(this.phase!=='playing'||!p||!active(p))throw new Error('진행 중인 경기에서만 사용할 수 있습니다.');
    const survivors=[...this.players.values()].filter(q=>q.role==='survivor'&&active(q));
    if(p.role==='killer'){
      if(!survivors.length||survivors.some(q=>!q.bot))throw new Error('남은 생존자가 모두 봇일 때만 경기를 종료할 수 있습니다.');
      for(const q of survivors)this.eliminate(q,'봇 경기 종료');
    }else{
      if(!survivors.every(q=>q.status==='down')&&survivors.some(q=>q.id!==id&&!q.bot))throw new Error('모두 빈사이거나 다른 생존자가 모두 봇일 때만 포기할 수 있습니다.');
      this.eliminate(p,'경기 포기');
    }
  }
  tick(dt){if(this.phase!=='playing')return;this.elapsed+=dt;for(const g of this.map.generators)g.workers=[];for(const h of this.map.cages)h.rescuers=[];for(const e of this.map.exits)e.workers=[];for(const p of this.players.values()){p.healers=[];p.mending=p.receivingMend||p.task?.key==='mend';p.receivingMend=false;}const k=[...this.players.values()].find(p=>p.role==='killer');
    // Resolve the landing once on the server, so rendered motion and stun share one clock.
    for(const pal of this.map.pallets)if(pal.state==='falling'&&this.elapsed>=pal.dropAt){pal.state='dropped';const center={x:pal.x+pal.w/2,y:pal.y+pal.h/2},origin=pal.dropOrigin;if(k&&k.status==='alive'&&origin&&distance(k,center)<55&&((pal.axis==='x'?(origin.x-center.x)*(k.x-center.x):(origin.y-center.y)*(k.y-center.y))<=0)){this.dropCarried(k,true);k.stun=C.stunSeconds;}delete pal.dropOrigin;}
    // Freeze pickup targets before anyone moves, independent of player iteration order.
    for(const p of this.players.values()){p.pickupBy=null;if(p.palletDrop?.until<=this.elapsed)p.palletDrop=null;}
    if(k?.connected&&k.status==='alive'&&!k.stun&&!k.cooldown&&!k.attackState&&!k.carrying&&(k.input.work||k.input.space)&&k.task){const target=this.players.get(k.task.key);if(target?.status==='down'&&distance(k,target)<65&&lineOfSight(this.map,k,target))target.pickupBy=k.id;}
    const skillConsumed=new Set(),held=new Map();for(const p of this.players.values()){held.set(p.id,p.input);if(p.pendingPress.size){p.input={...p.input};for(const key of p.pendingPress)p.input[key]=true;p.pendingPress.clear();}}
    for(const p of this.players.values()){
      if(!p.connected){p.disconnectTime+=dt;p.input=idle();if(p.disconnectTime>=C.disconnectGraceSeconds){if(p.role==='killer')this.eliminate(p,'연결 종료');else p.bot=true;}}if(p.bot){this.bots.frame(p);held.set(p.id,p.input);}
      if(!active(p))continue;this.updateAmbient(p,dt);
      for(const key of ['stun','immunity','haste','elusive','hitBoost','sprintBoost','patrolBoost','cooldown','swing','flashBlind'])p[key]=Math.max(0,p[key]-dt);p.flashlight=false;if(p.role==='killer')p.blindProgress=Math.max(0,p.blindProgress-dt*.5);if(p.role==='survivor'&&p.input.item&&p.itemType==='flashlight')p.facing={x:p.input.aimX??1,y:p.input.aimY??0};
      for(const entry of Object.values(p.vaultCounts))if(entry.lastChase&&this.elapsed-entry.lastChase>5&&(!k||distance(k,p)>500))entry.count=0;
      if(!p.input.run)p.exhaustion=Math.max(0,p.exhaustion-dt);
      if(p.role==='killer'){
        const len=Math.hypot(p.input.aimX??1,p.input.aimY??0);
        if(len){const wanted=Math.atan2(p.input.aimY,p.input.aimX),current=Math.atan2(p.facing.y,p.facing.x),delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current));const angle=p.attackState?.phase==='lunge'?current+clamp(delta,-Math.PI*dt,Math.PI*dt):wanted;p.facing={x:Math.cos(angle),y:Math.sin(angle)};}
        const target=[...this.players.values()].find(q=>q.role==='survivor'&&q.status==='alive'&&!q.hidden&&q.input.run&&!q.input.crouch&&distance(p,q)<12*C.pixelsPerMeter&&lineOfSight(this.map,p,q)&&((q.x-p.x)*p.facing.x+(q.y-p.y)*p.facing.y)/Math.max(1,distance(p,q))>Math.cos(Math.PI*35/180));
        if(target&&!p.stun&&!p.task&&!p.carrying){p.chaseTarget=target.id;p.chaseLost=0;p.chaseTime+=dt;}
        else if(p.chaseTarget){
          const q=this.players.get(p.chaseTarget),maintained=q?.status==='alive'&&!q.hidden&&q.input.run&&distance(p,q)<18*C.pixelsPerMeter&&lineOfSight(this.map,p,q)&&!p.task&&!p.stun&&!p.carrying;
          if(maintained){p.chaseLost=0;p.chaseTime+=dt;}else p.chaseLost+=dt;
          if(!q||!active(q)||distance(p,q)>18*C.pixelsPerMeter||p.chaseLost>=8)p.chaseTarget=null;
        }else p.chaseTime=Math.max(0,p.chaseTime-dt*6);
        p.bloodlust=p.chaseTime>=35?3:p.chaseTime>=25?2:p.chaseTime>=15?1:0;
        if(p.input.attack&&!p.previous.attack)this.attack(p);this.combat(p,dt);
      }
      else if(p.status==='alive'&&has(p,'sprinter')&&p.input.run&&!p.previous.run&&!p.exhaustion&&!p.input.crouch){p.sprintBoost=3;p.exhaustion=40;}
      if(p.vault){p.vault.progress+=dt;const t=clamp(p.vault.progress/p.vault.seconds,0,1);p.x=p.vault.from.x+(p.vault.to.x-p.vault.from.x)*t;p.y=p.vault.from.y+(p.vault.to.y-p.vault.from.y)*t;if(t>=1)p.vault=null;}else this.move(p,dt);if(p.role==='survivor'&&p.input.item&&p.itemType==='flashlight')p.facing={x:p.input.aimX??1,y:p.input.aimY??0};
      if(p.deepWound&&p.status==='alive'&&!p.input.run&&!p.mending){p.deepWound=Math.max(0,p.deepWound-dt);if(!p.deepWound){p.health=0;p.status='down';}}
      if(p.status==='down'){p.bleed+=dt;if(p.bleed>=C.bleedSeconds)this.eliminate(p,'출혈로 탈락');}
      if(p.status==='caged'){p.hookTime-=dt;if(p.hookTime<=0){p.hookStage++;p.skill=null;if(p.hookStage>=3)this.eliminate(p,'갈고리 희생');else{p.hookTime=C.hookSeconds;this.event(`${p.name} 갈고리 2단계`);}}if(p.hookStage===2){p.nextSkill-=dt;if(p.nextSkill<=0)this.beginSkill(p,'hook',null);}if(k&&!this.powered()&&this.endgame===null&&this.elapsed-p.hookedAt>=7&&!k.carrying){const friends=[...this.players.values()].filter(q=>q.role==='survivor'&&q.id!==p.id&&q.status==='alive'&&distance(q,p)<C.campRadius).length,rate=campRate(distance(p,k)/C.pixelsPerMeter,friends,p.campTime);if(rate>0){p.campTime+=dt;p.resolve=clamp(p.resolve+dt*rate,0,1);}}}

      if(p.status==='carried'&&k?.carrying===p.id){p.x=k.x;p.y=k.y+24;p.wiggle+=dt;if(!p.skill)this.beginSkill(p,'wiggle',null);}
      if(p.skill){if(p.input.space&&!p.previous.space){skillConsumed.add(p.id);this.skill(p);}else if(this.elapsed>p.skill.start+p.skill.duration)this.skill(p,true);}
      if(p.wiggle>=C.wiggleSeconds&&k?.carrying===p.id)this.dropCarried(k,true);

    }
    for(const p of this.players.values()){this.interact(p,dt,p.input.space&&!p.previous.space&&!skillConsumed.has(p.id));p.previous={...p.input};}
    for(const g of this.map.generators){if(g.workers.length){const factor=Math.max(.1,1-.15*(g.workers.length-1));let rate=0;for(const id of g.workers){const p=this.players.get(id);let speed=has(p,'engineer')?1.05:1;if(p.input.item&&p.itemType==='toolbox'&&p.itemCharge>0){const use=Math.min(p.itemCharge,dt*1.5);speed*=1+.5*use/(dt*1.5);p.itemCharge-=use;}rate+=speed*factor;}const gain=rate*dt;g.progress=Math.min(C.generatorSeconds,g.progress+gain);if(g.regressing){g.repairToStop+=gain;if(g.repairToStop>=4.5)g.regressing=false;}if(g.progress===C.generatorSeconds){g.regressing=false;this.event(`발전기 가동 · ${this.map.generators.filter(g=>g.progress>=C.generatorSeconds).length}/${this.generatorGoal}`);}}else if(g.regressing&&this.endgame===null)g.progress=Math.max(0,g.progress-.25*dt);}
    for(const p of this.players.values())if(p.healers.length){const speed=p.healers.reduce((n,id)=>{const h=this.players.get(id);let rate=has(h,'medic')?1.15:1;if(h.input.item&&h.itemType==='medkit'&&h.itemCharge>0){const use=Math.min(h.itemCharge,dt*rate*1.35);h.itemCharge-=use;rate+=.35*use/Math.max(.0001,dt*rate*1.35);}return n+rate;},0);if(p.deepWound){p.mend+=dt*speed/6;if(p.mend>=1){p.deepWound=0;p.mend=0;}continue;}if(p.status==='down'){p.recovery+=dt*speed/C.healSeconds;if(p.recovery>=1-1e-8){p.status='alive';p.health=1;p.recovery=0;}}else{p.healProgress+=dt*speed/C.healSeconds;if(p.healProgress>=1-1e-8){p.health=2;p.healProgress=0;}}}
    for(const h of this.map.cages){if(h.occupant&&h.rescuers.length){h.rescueProgress+=dt;if(h.rescueProgress>=C.rescueSeconds)this.unhook(this.players.get(h.occupant));}else h.rescueProgress=0;}
    for(const e of this.map.exits)if(e.workers.length&&!e.open){e.progress=Math.min(C.gateSeconds,e.progress+dt);if(e.progress>=C.gateSeconds){e.open=true;this.startEndgame();this.event('탈출구 개방 · 종반 붕괴 시작');}}
    const survivors=[...this.players.values()].filter(p=>p.role==='survivor'),remaining=survivors.filter(active);if(remaining.length===1&&!this.map.hatch.visible){this.map.hatch.visible=true;this.map.hatch.open=true;this.event('마지막 생존자 · 해치가 열렸습니다.');}
    for(const p of remaining)if(['alive','down'].includes(p.status)&&!p.hidden&&(this.map.exits.some(e=>e.open&&distance(e,p)<48)||this.map.hatch.visible&&this.map.hatch.open&&distance(p,this.map.hatch)<40)){if(this.map.hatch.visible&&this.map.hatch.open&&distance(p,this.map.hatch)<40)this.map.hatch.open=false;p.status='escaped';p.skill=null;this.event(`${p.name} 탈출 성공`);}
    if(this.endgame!==null){this.endgame=Math.max(0,this.endgame-dt*(survivors.some(p=>p.status==='down'||p.status==='caged')?.5:1));if(!this.endgame)for(const p of survivors.filter(active))this.eliminate(p,'종반 붕괴');}
    for(const p of this.players.values())p.input=p.connected||p.bot?held.get(p.id):idle();
    // Blood is independent of movement, sprint marks and interaction tasks.
    for(const p of this.players.values()){
      if(p.role==='survivor'&&['alive','down','carried'].includes(p.status)&&p.health<2&&!p.hidden&&!p.elusive){
        p.bloodTimer+=dt;
        if(p.bloodTimer>=.5){p.bloodTimer%=.5;this.traces.push({x:p.x,y:p.y,type:'blood',expires:this.elapsed+10});}
      }else p.bloodTimer=0;
    }
    this.traces=this.traces.filter(t=>t.expires>this.elapsed).slice(-400);this.noises=this.noises.filter(n=>n.expires>this.elapsed).slice(-20);
    if(k?.status==='out')this.finish('survivors','살인마의 연결이 종료되었습니다.');else if(survivors.every(p=>!active(p))){const escaped=survivors.filter(p=>p.status==='escaped').length;this.finish('individual',`경기 종료 · ${escaped}명 탈출 / ${survivors.length-escaped}명 탈락`);}
  }
  finish(winner,reason){this.phase='finished';this.result={winner,reason,escaped:[...this.players.values()].filter(p=>p.status==='escaped').length};}
  reset(id){if(id!==this.hostId)throw new Error('방장만 대기실로 돌아갈 수 있습니다.');if(this.phase!=='finished')throw new Error('경기가 끝난 뒤 돌아갈 수 있습니다.');for(const [key,p]of this.players)if(!p.connected)this.players.delete(key);else Object.assign(p,this.fresh());this.phase='lobby';this.result=null;this.endgame=null;this.elapsed=0;this.events=[];this.traces=[];this.noises=[];this.map=createMap();}
  snapshot(){return {code:this.code,name:this.name,maxPlayers:this.maxPlayers,hostId:this.hostId,phase:this.phase,map:this.map,players:[...this.players.values()].map(({input,previous,pendingPress,healers,vaultCounts,task,nextSkill,repairRolls,scratchTimer,bloodTimer,disconnectTime,skillRoll,lastMove,hitSequence,lastHitAt,afkOrigin,lockerTransition,lastInputAt,...p})=>({...p,skill:p.skill?{...p.skill,cursor:clamp((this.elapsed-p.skill.start)/p.skill.duration,0,1)}:null})),elapsed:this.elapsed,result:this.result,events:this.events,config:C,generatorGoal:this.generatorGoal,powered:this.powered()||this.endgame!==null,endgame:this.endgame,traces:this.traces,noises:this.noises,perks:PERKS};}
}
function segmentRect(a,b,w){const n=Math.ceil(distance(a,b)/8);for(let i=1;i<n;i++)if(intersects(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,1,w))return true;return false;}
