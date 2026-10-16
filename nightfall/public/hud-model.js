export const ITEM_NAMES={none:'장비 없음',medkit:'구급상자',toolbox:'공구상자',flashlight:'손전등',key:'열쇠',map:'지도'};
export const ITEM_CAPACITY={none:0,medkit:24,toolbox:32,flashlight:8,key:5,map:5};
export const STATE_NAMES={alive:'건강',down:'빈사',carried:'운반 중',caged:'갈고리',out:'희생 / 사망',escaped:'탈출'};
export const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
export function healthState(p){if(p.status==='out')return p.deathKind||'out';return p.status==='alive'&&p.health===1?'injured':p.status;}
export function actionTempo(speed=1){return speed>1.01?'fast':speed<.99?'slow':'normal';}
export function perkState(key,p){
  if(key==='sprinter')return p.exhaustion>0?{mode:'cooldown',remaining:p.exhaustion,duration:40}:p.sprintBoost>0?{mode:'active',remaining:p.sprintBoost,duration:3}:{mode:'ready'};
  if(key==='patrol')return p.patrolBoost>0?{mode:'active',remaining:p.patrolBoost,duration:8}:{mode:'ready'};
  return {mode:'passive'};
}
export function effectList(p,c){
 const effects=[];const add=(id,name,time,duration,buff=true)=>{if(time>0)effects.push({id,name,time,duration,buff});};
 add('endurance','인내',p.immunity,c.releaseImmunitySeconds);add('haste','구출 가속',p.haste,c.releaseImmunitySeconds);add('elusive','은신 보호',p.elusive,10);add('exhaustion','탈진',p.exhaustion,40,false);add('wound','깊은 상흔',p.deepWound,20,false);add('stun','기절',p.stun,c.stunSeconds,false);add('blind','실명',p.flashBlind,2,false);add('hit','피격 가속',p.hitBoost,c.hitBoostSeconds);add('sprint','전력 질주',p.sprintBoost,3);add('patrol','순찰 가속',p.patrolBoost,8);
 if(p.bloodlust>0)effects.push({id:'bloodlust',name:'피의 갈망 '+p.bloodlust,time:null,buff:true});return effects;
}
export function hookProgress(p,c){return {sacrifice:clamp(p.hookTime/c.hookSeconds),resolve:clamp(p.resolve),bleed:clamp(1-p.bleed/c.bleedSeconds)};}
export function visibleActivities(p){return p.teamActivity&&['repair','heal','selfHeal','mend','rescue','gate','chest','totem','recover','interact','sabotage'].includes(p.teamActivity.type)?p.teamActivity:null;}

export function healthLabel(p){return p.status==='out'?({sacrificed:'희생',killed:'살해됨',dead:'사망',abandoned:'경기 포기'}[p.deathKind]||'탈락'):p.status==='alive'&&p.health===1?'부상':STATE_NAMES[p.status];}
