export const INTENTS=Object.freeze(['수리할게요','구출하러 가요','치료가 필요해요','살인마가 근처예요','출구로 가요','도와주세요','고마워요','좋아요']);
export function sendIntent(room,p,index,now=Date.now()){
  if(room.phase!=='playing'||p?.role!=='survivor'||['out','escaped'].includes(p.status))throw Error('경기 중인 생존자만 메시지를 보낼 수 있습니다.');
  if(!Number.isInteger(index)||!INTENTS[index])throw Error('메시지를 선택해주세요.');
  const cooldown=p.intentCooldown||1000;
  if(now-(p.lastIntentAt??-Infinity)<cooldown){p.intentCooldown=Math.min(5000,cooldown+1000);throw Error('메시지를 너무 빠르게 보내고 있습니다.');}
  p.intentCooldown=now-(p.lastIntentAt??-Infinity)>5000?1000:cooldown;p.lastIntentAt=now;
  const message={id:room.code+':'+p.id+':'+now,playerId:p.id,text:INTENTS[index],until:room.elapsed+5};
  room.intents=(room.intents||[]).filter(m=>m.until>room.elapsed).concat(message).slice(-16);return message;
}
export function trialDetails(room,own){
  const done=room.phase==='finished',killer=[...room.players.values()].find(p=>p.role==='killer');
  if(room.phase==='playing'&&[...room.players.values()].some(p=>p.role==='survivor'&&(p.health<2||p.hookStage>0||killer?.chaseTarget===p.id)))room.killerRevealed=true;
  return {killerKnown:done||own.role==='killer'||!!room.killerRevealed,killerName:done||own.role==='killer'||room.killerRevealed?'추적자 · 기본 공격':null,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,role:p.role,status:p.status,loadout:done||p.role===own.role?{perks:p.perks,item:p.itemType}:null}))};
}
