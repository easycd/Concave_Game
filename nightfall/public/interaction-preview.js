import {penetration} from './motion.js';
import {rayDistance} from './vision.js';
// Visual feedback only. Server snapshots always decide collisions and outcomes.
export function createInteractionPreview(){
  let pending=null;
  function press(s,p,input,now){
    if(!s||s.phase!=='playing'||!p||p.role!=='survivor'||p.status!=='alive'||p.hidden||p.vault||p.palletDrop||p.skill||p.stun)return;
    const near=(objects,r)=>objects.map(o=>({o,c:{x:o.x+o.w/2,y:o.y+o.h/2}})).filter(({c})=>{const d=Math.hypot(c.x-p.x,c.y-p.y),a=Math.atan2(c.y-p.y,c.x-p.x);return d<r&&!s.map.walls.some(w=>rayDistance(p,a,w,d)<d-.01);}).sort((a,b)=>Math.hypot(a.c.x-p.x,a.c.y-p.y)-Math.hypot(b.c.x-p.x,b.c.y-p.y))[0]?.o;
    const pal=near(s.map.pallets.filter(o=>o.state!=='broken'),65),o=pal||near(s.map.windows,65);
    if(!o||o.state==='falling')return;
    if(o.state==='ready'){pending={kind:'pallet',id:o.id,now,elapsed:s.elapsed};return;}
    if(p.cooldown)return;
    if(s.windowBlocks?.some(w=>w.id===o.id))return;
    const cx=o.x+o.w/2,cy=o.y+o.h/2,vertical=o.axis==='x',side=vertical?(p.x<cx?-1:1):(p.y<cy?-1:1);
    const to={x:vertical?cx-side*(o.w/2+26):cx,y:vertical?cy:cy-side*(o.h/2+26)};
    if([...s.map.walls,...s.map.windows,...s.map.pallets.filter(q=>q.state==='dropped')].some(w=>penetration(to.x,to.y,s.config.playerRadius,w)>0))return;
    const running=input.run&&!input.crouch,normal=vertical?Math.abs(input.x):Math.abs(input.y),fast=running&&normal>.9&&p.runDistance>=2.5*s.config.pixelsPerMeter;
    pending={kind:'vault',id:o.id,player:p.id,from:{x:p.x,y:p.y},to,seconds:pal?(running?1.1:2):running?(fast?.5:.9):1.5,now};
  }
  function frame(s,players,now){
    if(!pending)return {map:s.map,players};
    const p=pending,age=(now-p.now)/1000,own=players.find(q=>q.id===p.player);
    const confirmed=p.kind==='pallet'?s.map.pallets.find(o=>o.id===p.id)?.state!=='ready':own?.vault;
    if(s.phase!=='playing'||age>.35||confirmed){pending=null;return {map:s.map,players};}
    if(p.kind==='pallet')return {players,map:{...s.map,pallets:s.map.pallets.map(o=>o.id===p.id?{...o,state:'falling',dropStarted:s.elapsed-age,dropAt:s.elapsed-age+s.config.palletDropSeconds}:o)}};
    const t=Math.min(1,age/p.seconds);
    return {map:s.map,players:players.map(q=>q.id===p.player?{...q,x:p.from.x+(p.to.x-p.from.x)*t,y:p.from.y+(p.to.y-p.from.y)*t,vault:{id:p.id,from:p.from,to:p.to,progress:age,seconds:p.seconds}}:q)};
  }
  return {press,frame,reset:()=>pending=null};
}
