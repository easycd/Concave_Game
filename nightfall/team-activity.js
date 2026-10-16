import {CONFIG as C} from './config.js';
// A small, coordinate-free projection of actions teammates are allowed to know.
export function teamActivity(room,p){
  if(room.phase!=='playing'||p.role!=='survivor'||['out','escaped'].includes(p.status))return null;
  const progress=n=>Math.max(0,Math.min(1,n||0));
  const result=(type,value=null)=>({type,progress:value===null?null:progress(value),chased:[...room.players.values()].some(k=>k.role==='killer'&&k.chaseTarget===p.id)});
  if(p.status==='caged')return result('hooked',p.resolve);
  if(p.status==='carried')return result('wiggle',p.wiggle/C.wiggleSeconds);
  if(p.status==='down')return result(p.pickupBy?'pickup':!p.input.x&&!p.input.y?'recover':'crawl',p.recovery);
  const gen=room.map.generators.find(g=>g.workers?.includes(p.id));
  if(gen)return result('repair',gen.progress/C.generatorSeconds);
  const healed=[...room.players.values()].find(q=>q.healers?.includes(p.id));
  if(healed)return result(healed.deepWound?'mend':'heal',healed.deepWound?healed.mend:healed.status==='down'?healed.recovery:healed.healProgress);
  if(p.task?.key==='mend')return result('mend',p.task.progress/C.selfMendSeconds);
  const hook=room.map.cages.find(h=>h.rescuers?.includes(p.id));
  if(hook)return result('rescue',hook.rescueProgress/C.rescueSeconds);
  const gate=room.map.exits.find(e=>e.workers?.includes(p.id));
  if(gate)return result('gate',gate.progress/C.gateSeconds);
  if(p.action?.label==='구급상자 자기 치료')return result('selfHeal',p.healProgress);
  if(p.task){const key=p.task.key;return result(key==='read-map'?'map':key==='read-key'?'key':key==='unlock-hatch'?'key':room.map.chests.some(c=>c.id===key)?'chest':room.map.totems.some(t=>t.id===key)?'totem':room.map.cages.some(h=>h.id===key)?'sabotage':'interact',p.action?.progress);}
  if(p.hidden)return result('locker');
  if(p.vault)return result('vault');
  if(p.flashlight)return result('flashlight');
  return result(p.moveSpeed>1?'move':'idle');
}
