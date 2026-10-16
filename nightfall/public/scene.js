import { visionPolygon, viewFov, viewAngle } from './vision.js';
import { createSkillCheckPresentation } from './skill-check.js';
export function createScene(context){
 let ctx=context;
 const fog=document.createElement('canvas'),fc=fog.getContext('2d');
 const terrainCanvas=document.createElement('canvas'),terrainContext=terrainCanvas.getContext('2d');
 let terrainCache=null,fogKey='',auraLayoutKey='',auraSlots=new Map();
 const skillPresentation=createSkillCheckPresentation();
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let bounds={left:0,top:0,right:Infinity,bottom:Infinity};
 const inView=(p,margin=100)=>p.x+(p.w||0)+margin>=bounds.left&&p.y+(p.h||0)+margin>=bounds.top&&p.x-margin<=bounds.right&&p.y-margin<=bounds.bottom;
 const updateBounds=()=>{const t=ctx.getTransform();bounds={left:-t.e/t.a,top:-t.f/t.d,right:(ctx.canvas.width-t.e)/t.a,bottom:(ctx.canvas.height-t.f)/t.d};};
 const rect=(x,y,w,h,color,r=3)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
 const text=(s,x,y,c='#a1ad98',size=11)=>{ctx.font=`${size}px Segoe UI, Malgun Gothic`;ctx.textAlign='center';ctx.fillStyle=c;ctx.fillText(s,x,y);};
 function floor(m){updateBounds();rect(0,0,m.width,m.height,'#111217',0);for(const z of m.zones){if(!inView(z))continue;rect(z.x,z.y,z.w,z.h,{forest:'#111318',yard:'#18191e',ruins:'#1b1b21',logging:'#19181d',building:'#252329'}[z.type],z.type==='building'?0:65);if(z.type==='building'){ctx.strokeStyle='#69625255';ctx.lineWidth=1;for(let y=z.y;y<z.y+z.h;y+=26){ctx.beginPath();ctx.moveTo(z.x,y);ctx.lineTo(z.x+z.w,y);ctx.stroke();}for(let x=z.x+35;x<z.x+z.w;x+=70)for(let y=z.y+13;y<z.y+z.h;y+=52)rect(x,y,1,26,'#201f1b55',0);}}
 const groundStep=ctx.getTransform().a<.35?3:1;for(let di=0;di<m.decor.length;di+=groundStep){const d=m.decor[di];if(!inView(d,45))continue;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);if(d.type==='stump'){ctx.fillStyle='#080e0966';ctx.beginPath();ctx.ellipse(5,5,d.size*.55,d.size*.4,0,0,7);ctx.fill();rect(-d.size/3,-d.size/3,d.size*.65,d.size*.65,'#5e5740',9);ctx.strokeStyle='#958469';ctx.beginPath();ctx.arc(0,0,d.size*.2,0,7);ctx.stroke();}else if(d.type==='pebble'){rect(-3,-2,d.size*.22,d.size*.14,'#71807355',3);}else if(d.type==='fern'){ctx.strokeStyle='#393b45';ctx.lineWidth=1.5;ctx.beginPath();for(let j=-3;j<=3;j++){ctx.moveTo(0,8);ctx.lineTo(j*d.size*.3,-d.size*.5);ctx.moveTo(j*d.size*.12,0);ctx.lineTo(j*d.size*.3+4,-d.size*.1);}ctx.stroke();}else if(d.type==='flower'){ctx.fillStyle='#73717b44';for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(j*4-6,-j*3,2,0,7);ctx.fill();}}else{ctx.strokeStyle='#48475288';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<5;i++){ctx.moveTo(i*4,5);ctx.lineTo(i*4-4,-d.size*(.3+i*.06));}ctx.stroke();}ctx.restore();}
 ctx.strokeStyle='#7d7860';ctx.lineWidth=10;ctx.strokeRect(7,7,m.width-14,m.height-14);ctx.lineWidth=1;for(const z of m.zones)text(z.name,z.x+z.w/2,z.y+z.h/2,'#b0ae9255',26);
 }
 function walls(m){for(const w of m.walls){if(!inView(w,w.crown||100))continue;rect(w.x+9,w.y+10,w.w,w.h,'#07100caa');const colors={wood:'#685b5d',stone:'#696975',rock:'#595b68',car:'#505762',metal:'#68616b',tree:'#363139'};rect(w.x,w.y,w.w,w.h,colors[w.material]||'#696b5c',w.material==='rock'?20:w.material==='tree'?15:3);ctx.strokeStyle=w.material==='tree'?'#a79a9370':'#aaa2b1';ctx.lineWidth=w.material==='tree'?2:2.5;ctx.strokeRect(w.x+1,w.y+1,w.w-2,w.h-2);if(w.material==='tree'){const x=w.x+w.w/2,y=w.y+w.h/2,r=w.crown||48;ctx.save();ctx.translate(x,y);ctx.rotate(w.angle||0);ctx.globalAlpha=.42;ctx.fillStyle='#030c0988';ctx.beginPath();ctx.ellipse(15,20,r*.85,r*.7,0,0,7);ctx.fill();if(w.variant==='dead'){ctx.strokeStyle='#49444e';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,25);ctx.lineTo(-5,-r*.6);ctx.moveTo(-4,-r*.25);ctx.lineTo(-r*.55,-r*.55);ctx.moveTo(-3,-r*.4);ctx.lineTo(r*.45,-r*.7);ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#8f8994';ctx.stroke();}else{const birch=w.variant==='birch';for(let j=0;j<7;j++){const a=j*Math.PI*2/7,rr=r*(j%2?.52:.58);ctx.fillStyle=birch?(j%2?'#272932':'#22242c'):(j%2?'#20222a':'#1b1d25');ctx.beginPath();ctx.arc(Math.cos(a)*r*.35,Math.sin(a)*r*.35,rr,0,7);ctx.fill();}ctx.fillStyle=birch?'#33343f':'#292b35';ctx.beginPath();ctx.arc(-10,-12,r*.45,0,7);ctx.fill();ctx.strokeStyle=birch?'#c3bea0':'#7d7252';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(-4,-10);ctx.stroke();}ctx.restore();
 // Draw the actual collision footprint last, above passable branches and foliage.
 rect(w.x-3,w.y-3,w.w+6,w.h+6,'#08070cdd',5);rect(w.x,w.y,w.w,w.h,'#80675b',4);ctx.strokeStyle='#d7b89b';ctx.lineWidth=2;ctx.strokeRect(w.x+1,w.y+1,w.w-2,w.h-2);ctx.strokeStyle='#42312b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(w.x+w.w/2,w.y+w.h/2,w.w*.28,w.h*.28,0,0,7);ctx.stroke();rect(w.x+4,w.y+3,w.w-8,3,'#c5a88d',0);
 }else if(w.material==='car'){rect(w.x+10,w.y+8,w.w-20,w.h-16,'#414e52',12);rect(w.x+35,w.y+12,w.w-68,w.h-24,'#1c3034',4);rect(w.x+4,w.y+w.h-7,18,7,'#151c1b');rect(w.x+w.w-24,w.y+w.h-7,18,7,'#151c1b');rect(w.x+w.w-8,w.y+8,5,12,'#bb9771');}else{rect(w.x+5,w.y+5,Math.max(2,w.w-10),Math.max(2,w.h-10),'#17151d88');rect(w.x+3,w.y+2,Math.max(2,w.w-6),3,'#c8bcc255',0);if(w.material==='wood'){ctx.strokeStyle='#d7b89b99';ctx.lineWidth=2;ctx.strokeRect(w.x+1,w.y+1,w.w-2,w.h-2);}ctx.strokeStyle='#a2a48c33';ctx.beginPath();if(w.w>w.h)for(let x=24;x<w.w;x+=36){ctx.moveTo(w.x+x,w.y);ctx.lineTo(w.x+x,w.y+w.h);}else for(let y=24;y<w.h;y+=36){ctx.moveTo(w.x,w.y+y);ctx.lineTo(w.x+w.w,w.y+y);}ctx.stroke();}}
 for(const w of m.windows){if(!inView(w))continue;rect(w.x,w.y,w.w,w.h,'#365c64');ctx.strokeStyle='#81b3b5';ctx.lineWidth=3;ctx.strokeRect(w.x+2,w.y+2,w.w-4,w.h-4);ctx.lineWidth=1;text('창문',w.x+w.w/2,w.y-8,'#8cbdbe',10);}}
 function scenery(m){for(const b of m.bushes){if(!inView(b))continue;rect(b.x,b.y,b.w,b.h,'#1b1c23',24);for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#30313a':'#252630';ctx.beginPath();ctx.arc(b.x+12+i*(b.w-24)/9,b.y+20+(i%3)*16,20,0,7);ctx.fill();}}
 walls(m);
 }
 function terrain(m,view,radius){
   updateBounds();
   // Do not rasterize the world hidden behind the opaque circular fog.
   if(view&&radius){bounds={left:Math.max(bounds.left,view.x-radius-100),top:Math.max(bounds.top,view.y-radius-100),right:Math.min(bounds.right,view.x+radius+100),bottom:Math.min(bounds.bottom,view.y+radius+100)};}
   const visibleBounds=bounds;
   if(!view){floor(m);scenery(m);return;}
   const old=terrainCache;
   if(!old||old.walls!==m.walls||old.bushes!==m.bushes||old.decor!==m.decor||old.windows!==m.windows||old.zones!==m.zones||bounds.left<old.x||bounds.top<old.y||bounds.right>old.x+old.w||bounds.bottom>old.y+old.h){
     const x=Math.floor(bounds.left/128)*128-128,y=Math.floor(bounds.top/128)*128-128,w=Math.ceil((bounds.right-x+128)/128)*128,h=Math.ceil((bounds.bottom-y+128)/128)*128;
     const scale=Math.min(ctx.getTransform().a,1.5,Math.sqrt(4e6/(w*h)));
     terrainCanvas.width=Math.ceil(w*scale);terrainCanvas.height=Math.ceil(h*scale);
     terrainContext.setTransform(scale,0,0,scale,-x*scale,-y*scale);
     ctx=terrainContext;
     try{floor(m);scenery(m);}finally{ctx=context;bounds=visibleBounds;}
     terrainCache={x,y,w,h,walls:m.walls,bushes:m.bushes,decor:m.decor,windows:m.windows,zones:m.zones};
   }
   const c=terrainCache;ctx.drawImage(terrainCanvas,c.x,c.y,c.w,c.h);
 }
 function objects(s){const m=s.map;
 for(const p of m.pallets){if(!inView(p))continue;const vertical=p.h>p.w,cx=p.x+p.w/2,cy=p.y+p.h/2,length=Math.max(p.w,p.h),width=Math.min(p.w,p.h),t=p.state==='falling'?Math.max(0,Math.min(1,((s.visualTime??s.elapsed)-p.dropStarted)/s.config.palletDropSeconds)):p.state==='ready'?0:1;
   ctx.save();ctx.translate(cx,cy);if(vertical)ctx.rotate(Math.PI/2);
   if(p.state==='broken'){for(let i=0;i<5;i++){ctx.save();ctx.translate((i-2)*12,(i%2)*10);ctx.rotate(i*.9);rect(-16,-3,32,6,'#705252');ctx.restore();}ctx.restore();continue;}
   const ease=1-(1-t)**3,span=length*(.42+.58*ease),lift=(1-ease)*12;
   rect(-length/2,-width/2,length,width,'#08070d99');ctx.translate(0,-lift);ctx.rotate((1-ease)*-.1);
   rect(-span/2,-width/2,span,width,p.state==='ready'?'#a77a61':'#875c53');ctx.strokeStyle='#e6b89a';ctx.lineWidth=2;ctx.strokeRect(-span/2,-width/2,span,width);
   for(let i=1;i<5;i++)rect(-span/2+i*span/5,-width/2,3,width,'#342831',0);
   if(p.state==='ready'){ctx.strokeStyle='#e1b792';ctx.beginPath();ctx.moveTo(-span*.3,-width/2);ctx.lineTo(span*.3,width/2);ctx.stroke();}
   if(p.state==='falling'&&!reducedMotion.matches){ctx.globalAlpha=1-t;ctx.strokeStyle='#e7cab1';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,length*.55,20+t*20,0,0,7);ctx.stroke();}
   ctx.restore();text(p.state==='ready'?'SPACE · 쓰러뜨리기':p.state==='falling'?'쓰러지는 중':'SPACE · 넘기',cx,p.y-13,'#dfb6a5',11);
 }
 for(const l of m.cabinets){if(!inView(l))continue;rect(l.x-19+5,l.y-26+5,38,52,'#080c0acc');rect(l.x-19,l.y-26,38,52,'#715348');rect(l.x-14,l.y-22,28,44,'#4a3934');rect(l.x-1,l.y-21,2,42,'#a27962');for(let j=0;j<4;j++){rect(l.x-10,l.y-17+j*4,6,1,'#b89173');rect(l.x+4,l.y-17+j*4,6,1,'#b89173');}rect(l.x+6,l.y+5,3,5,'#c5b297');}
 for(const h of m.cages){if(!inView(h))continue;if(h.availableUntil>s.elapsed){rect(h.x-5,h.y-35,10,72,'#463e34');text(`복구 ${Math.ceil(h.availableUntil-s.elapsed)}초`,h.x,h.y+53,'#9c8573',10);continue;}rect(h.x-5,h.y-35,10,72,'#5a5142');rect(h.x-5,h.y-38,38,10,'#6f5948');ctx.strokeStyle=h.occupant?'#d17c65':'#bab7a0';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(h.x+23,h.y-29);ctx.lineTo(h.x+23,h.y-9);ctx.arc(h.x+16,h.y-9,7,0,Math.PI);ctx.stroke();ctx.lineWidth=1;text(h.occupant?'구출 E':'갈고리',h.x,h.y+53,h.occupant?'#efad93':'#a7a692',10);}
 for(const g of m.generators){if(!inView(g))continue;const on=g.progress>=s.config.generatorSeconds;ctx.shadowColor=on?'#d8d98b':'#ba7448';ctx.shadowBlur=on?30:8;rect(g.x-26,g.y-23,52,47,on?'#76774b':'#52635b');ctx.shadowBlur=0;rect(g.x-18,g.y-16,36,25,'#26352e');for(let i=0;i<3;i++){rect(g.x-15+i*12,g.y-12,8,18,on?'#a7b075':'#8c8770');rect(g.x-12+i*12,g.y-25,3,9,'#5f645c');}rect(g.x+18,g.y-42,5,23,'#6b7462');rect(g.x+8,g.y-45,24,5,on?'#e8e8b0':'#d89461');rect(g.x-26,g.y+31,52,4,'#101e17');rect(g.x-26,g.y+31,52*g.progress/s.config.generatorSeconds,4,g.regressing?'#d57659':'#bfd284');text(on?'가동':`${g.regressing?'퇴행 ':''}${Math.floor(g.progress/s.config.generatorSeconds*100)}%`,g.x,g.y+50,on?'#d4e9a4':'#c8bb99',11);}
 for(const e of m.exits){if(!inView(e))continue;rect(e.x-29,e.y-60,58,120,'#171e19');rect(e.x-36,e.y-64,8,128,'#787565');rect(e.x+28,e.y-64,8,128,'#787565');if(!e.open)for(let i=0;i<6;i++)rect(e.x-25+i*9,e.y-54,4,108,'#7c8276');else rect(e.x-24,e.y-53,48,106,'#abb87a44');for(let i=0;i<3;i++)rect(e.x-20+i*15,e.y-75,7,5,e.progress>=s.config.gateSeconds*(i+1)/4?'#e58460':'#46362c');text(e.open?'탈출':s.powered||s.endgame!==null?`개방 E · ${Math.floor(e.progress/s.config.gateSeconds*100)}%`:'전력 없음',e.x,e.y+83,e.open?'#d0e495':'#c3ab87',11);}
 for(const c of m.chests){if(!inView(c))continue;rect(c.x-18,c.y-12,36,26,c.opened?'#493b2c':'#8b7150');rect(c.x-20,c.y-15,40,6,'#ab8f61');rect(c.x-2,c.y-9,4,12,'#d3b57b');text(c.opened?'빈 상자':'상자 E',c.x,c.y+32,'#afaa8c',10);}
 for(const t of m.totems||[]){if(!inView(t))continue;rect(t.x-13,t.y-10,26,20,t.cleansed?'#494539':'#9c9479',5);if(!t.cleansed)text('토템 E',t.x,t.y+30,'#c8b997',10);}
 for(const i of m.items||[]){if(!inView(i))continue;rect(i.x-10,i.y-7,20,14,'#a9b08a',3);text(({medkit:'구급상자',toolbox:'공구상자',flashlight:'손전등',key:'열쇠',map:'지도'})[i.type]+' E',i.x,i.y+26,'#c8c6a3',10);}
 if(m.hatch.visible){const h=m.hatch;rect(h.x-29,h.y-25,58,50,'#9a9677');rect(h.x-24,h.y-20,48,40,h.open?'#030906':'#464a42');text(h.open?'해치 · 탈출':'해치 닫힘',h.x,h.y+44,'#d8d5aa',12);}
 for(const t of s.traces||[]){ctx.globalAlpha=t.type==='scratch'?Math.max(0,Math.min(1,s.elapsed-(t.created??s.elapsed-1),t.expires-s.elapsed)):Math.min(1,(t.expires-s.elapsed)/3);if(t.type==='blood'){ctx.fillStyle='#813d35';ctx.beginPath();ctx.ellipse(t.x,t.y,5,3,.4,0,7);ctx.fill();}else for(let i=0;i<3;i++){ctx.strokeStyle='#ee684f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(t.x+i*6,t.y-7);ctx.lineTo(t.x+i*6-5,t.y+9);ctx.stroke();}}ctx.globalAlpha=1;
 for(const n of s.noises||[]){ctx.strokeStyle='#edb36c';ctx.beginPath();ctx.arc(n.x,n.y,28+Math.sin(s.elapsed*8)*5,0,7);ctx.stroke();text('!',n.x,n.y+5,'#ffcf8f',20);}}
 function crawl(p,s){
   const moving=p.moveSpeed>0&&!p.pickupBy,phase=reducedMotion.matches||!moving?0:Math.sin((s.visualTime??s.elapsed)*8),angle=Math.atan2(p.facing?.y||0,p.facing?.x||1);
   ctx.save();ctx.rotate(angle);ctx.strokeStyle='#aa8d7f';ctx.lineWidth=6;ctx.lineCap='round';
   const limb=(points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
   limb([[-6,-7],[-18,-14+phase*3],[-29,-10-phase*4]]);limb([[-6,7],[-18,14-phase*3],[-29,10+phase*4]]);
   ctx.strokeStyle=p.cosmetics?.survivorColor||'#657f62';ctx.lineWidth=9;limb([[-6,0],[-22,-3]]);
   limb([[5,-7],[13,-16-phase*4],[22,-11-phase*6]]);limb([[5,7],[13,16+phase*4],[24,12+phase*6]]);
   rect(-10,-10,27,20,p.cosmetics?.survivorColor||'#657f62',7);ctx.strokeStyle='#f2b3ac';ctx.lineWidth=1.5;ctx.strokeRect(-9,-9,25,18);
   ctx.fillStyle='#c9b696';ctx.beginPath();ctx.arc(22,-1,8,0,7);ctx.fill();rect(17,-8,11,4,'#352c24',3);ctx.restore();
 }
 function players(s,myId,avatarOnly=false){for(const p of s.players){if(p.x==null||['out','escaped'].includes(p.status))continue;ctx.save();ctx.translate(p.x,p.y);if(p.vault){const jump=Math.sin(Math.PI*Math.min(1,p.vault.progress/p.vault.seconds));ctx.translate(0,-jump*13);ctx.scale(1+jump*.08,1-jump*.12);}if(p.hidden)ctx.globalAlpha=.45;const k=p.role==='killer';if(k&&!avatarOnly){ctx.save();ctx.rotate(Math.atan2(p.facing.y,p.facing.x));const grad=ctx.createLinearGradient(0,0,120,0);grad.addColorStop(0,'#ff65564a');grad.addColorStop(1,'#b7292900');ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(130,-50);ctx.lineTo(130,50);ctx.closePath();ctx.fill();if(p.swing>0||p.attackState){ctx.strokeStyle='#f2dfb4';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,75,-.7,.7);ctx.stroke();}ctx.restore();}if(p.immunity>0){ctx.strokeStyle='#e4eabe';ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(0,0,24,0,7);ctx.stroke();ctx.setLineDash([]);}ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(3,13,18,9,0,0,7);ctx.fill();if(p.status==='down')crawl(p,s);else if(p.status==='carried'){ctx.save();ctx.rotate(.45);rect(-21,-8,32,17,p.cosmetics?.survivorColor||'#657f62',6);ctx.fillStyle='#c9b696';ctx.beginPath();ctx.arc(18,-1,8,0,7);ctx.fill();ctx.restore();}else{rect(-12,-5,24,26,(k?p.cosmetics?.killerColor:p.cosmetics?.survivorColor)||(k?'#643e37':'#657f62'),8);ctx.strokeStyle=p.health===1?'#f1a18a':'#d8dec477';ctx.lineWidth=1.5;ctx.strokeRect(-11,-3,22,23);ctx.fillStyle=k?'#e0d5b7':'#c9b696';ctx.beginPath();ctx.arc(0,-10,9,0,7);ctx.fill();if(k){rect(-5,-12,3,4,'#50372e');rect(3,-12,3,4,'#50372e');ctx.save();ctx.rotate(Math.atan2(p.facing.y,p.facing.x));rect(15,-4,31,5,'#bfc4b6');ctx.restore();}else{rect(-9,-18,18,6,'#352c24',5);}}if(p.flashlight&&!avatarOnly){ctx.save();ctx.rotate(Math.atan2(p.facing.y,p.facing.x));ctx.fillStyle='#ffeead33';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(260,-50);ctx.lineTo(260,50);ctx.closePath();ctx.fill();ctx.restore();}if(p.status==='caged'){rect(-49,-72,98,29,'#450d1bee',5);text(`갈고리 ${p.hookStage}단계`,0,-52,'#fff0ef',16);text(`${Math.ceil(p.hookTime)}초`,0,-82,'#ffa7ae',13);}if(p.vault)text('넘는 중',0,-34,'#f1c4a6',12);if(p.pickupBy)text('들어 올리는 중',0,-33,'#ffb0b6',12);if(p.stun)text('✦ ✦',0,-37,'#e6cf88',16);text(p.name+(p.id===myId?' · 나':''),0,42,p.id===myId?'#e5ecb9':k?'#e6b19c':'#c6d0bb',11);ctx.restore();}}
 function visibility(m,view,camera,W,H,radius,config={survivorFov:150,killerFov:100}){
   const cx=view.x-camera.x+W/2,cy=view.y-camera.y+H/2,fov=viewFov(view,config);
   const key=`${m.seed}:${W}:${H}:${radius}:${cx}:${cy}:${view.x}:${view.y}:${viewAngle(view)}:${fov}`;
   if(key===fogKey){ctx.drawImage(fog,0,0);return;}fogKey=key;
   if(fog.width!==W||fog.height!==H){fog.width=W;fog.height=H;}fc.clearRect(0,0,W,H);fc.globalCompositeOperation='source-over';fc.fillStyle='#030308';fc.fillRect(0,0,W,H);
   const points=visionPolygon(m,view,radius,fov),screen=p=>({x:p.x-camera.x+W/2,y:p.y-camera.y+H/2});
   // Feather the cone silhouette (including wall shadows) on the small cached mask.
   fc.globalCompositeOperation='destination-out';fc.filter='blur(8px)';fc.beginPath();fc.moveTo(cx,cy);for(const p of points){const q=screen(p);fc.lineTo(q.x,q.y);}fc.closePath();fc.fill();fc.filter='none';fc.globalCompositeOperation='source-over';
   const g=fc.createRadialGradient(cx,cy,0,cx,cy,radius);g.addColorStop(0,'#03030810');g.addColorStop(.35,'#03030828');g.addColorStop(.65,'#03030877');g.addColorStop(.85,'#030308d0');g.addColorStop(1,'#030308');fc.fillStyle=g;fc.fillRect(0,0,W,H);
   for(let i=1;i<points.length;i++){const a=screen(points[i-1]),b=screen(points[i]),edge=Math.pow(Math.abs((points[i-1].delta+points[i].delta)/fov),8);fc.fillStyle=`rgba(3,3,8,${edge})`;fc.beginPath();fc.moveTo(cx,cy);fc.lineTo(a.x,a.y);fc.lineTo(b.x,b.y);fc.closePath();fc.fill();}
   ctx.drawImage(fog,0,0);
 }
 function skill(s,p,W,H,snapshotAge,camera,now){const frame=skillPresentation.frame(s,p,W,H,snapshotAge,camera,now,reducedMotion.matches);if(!frame)return;const {check:c,phase,x,y,opacity}=frame,r=51;
 if(c.type==='wiggle'){
   const wave=1-Math.abs(1-phase*2),left=W/2-120,top=H*.7;
   ctx.save();ctx.globalAlpha*=opacity;rect(left-14,top-25,268,90,'#0b1411e6',12);rect(left,top,240,10,'#526451');
   for(const x of [left+30,left+210]){rect(x-19,top-7,38,24,'#d5dbb7',2);rect(x-7,top-7,14,24,'#e3bc76',2);}
   rect(left+wave*240-2,top-14,4,38,'#ed876e',1);text('SPACE · 운반 저항',W/2,top+50,'#e9e8d4',13);ctx.restore();return;
 }ctx.save();ctx.globalAlpha*=opacity;ctx.fillStyle='#0b1411e6';ctx.beginPath();ctx.arc(x,y,r+17,0,7);ctx.fill();ctx.strokeStyle='#899a8b';ctx.lineWidth=7;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.stroke();for(const [zone,color]of [[c.good,'#e6e8cc'],[c.great,'#e4bc73']]){ctx.strokeStyle=color;ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2+zone[0]*Math.PI*2,-Math.PI/2+zone[1]*Math.PI*2);ctx.stroke();}ctx.strokeStyle='#dc7258';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(-Math.PI/2+phase*Math.PI*2)*(r+10),y+Math.sin(-Math.PI/2+phase*Math.PI*2)*(r+10));ctx.stroke();ctx.lineWidth=1;text('SPACE',x,y+5,'#e9e8d4',13);text(c.type==='wiggle'?'운반 저항':c.type==='hook'?'버티기':'스킬 체크',x,y+r+39,'#dcc39c',12);ctx.restore();}
 function hookIcon(x,y,color,size=16){ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-6,-size*.7);ctx.lineTo(6,-size*.7);ctx.lineTo(6,2);ctx.arc(0,2,6,0,Math.PI);ctx.stroke();ctx.restore();}
 function auras(s,view,camera,W,H){
   const layoutKey=`${s.map.seed}:${view.id}:${view.role}:${view.mapReading}:${W}:${H}:${Math.round(camera.x/64)}:${Math.round(camera.y/64)}:${s.players.map(p=>p.id+p.status).join(',')}`;
   if(layoutKey!==auraLayoutKey){auraLayoutKey=layoutKey;auraSlots.clear();}
   const marker=(p,label,color,kind,pulse=false)=>{
     const q=projectMarker(p,camera,W,H);if(q.offscreen)return;
     const wave=pulse&&!reducedMotion.matches?.5+.5*Math.sin((s.visualTime??s.elapsed)*4):0;
     ctx.save();ctx.translate(q.x,q.y);ctx.globalAlpha=.7+.25*wave;
     ctx.shadowColor=color;ctx.shadowBlur=8;
     if(kind==='hook')hookIcon(0,-1,color);else{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(-12,-13,24,26);}
     ctx.restore();
   };
   for(const w of s.map.windows)if(s.windowBlocks?.some(b=>b.id===w.id)){const q=projectMarker({x:w.x+w.w/2,y:w.y+w.h/2},camera,W,H);if(!q.offscreen)text('창문 봉쇄',q.x,q.y-20,'#e5bd87',12);}
   if(view.role==='killer'){
     s.map.generators.forEach((g,i)=>marker(g,`발전기 ${i+1}${g.progress>=s.config.generatorSeconds?' · 가동':''}`,g.progress>=s.config.generatorSeconds?'#c6c5a0':'#ecbd84','generator'));
     s.map.cages.forEach((h,i)=>marker(h,`갈고리 ${i+1}`,h.availableUntil>s.elapsed?'#9a8795':'#e77b89','hook'));
   }else if(view.mapReading&&!view.hidden){for(const w of [...s.map.windows,...s.map.pallets.filter(p=>p.state!=='broken')])if(Math.hypot(view.x-w.x,view.y-w.y)<s.config.mapRange){const q=projectMarker({x:w.x+w.w/2,y:w.y+w.h/2},camera,W,H);if(!q.offscreen){ctx.strokeStyle='#eed9a0';ctx.lineWidth=3;ctx.strokeRect(q.x-w.w/2,q.y-w.h/2,w.w,w.h);}}}
   if(view.role==='survivor'&&!view.hidden){
     for(const b of s.beacons||[]){const q=projectMarker(b,camera,W,H);if(!q.offscreen){const beam=ctx.createLinearGradient(q.x,q.y-200,q.x,q.y);beam.addColorStop(0,'#e7d8a000');beam.addColorStop(1,'#e7d8a0aa');ctx.fillStyle=beam;ctx.fillRect(q.x-5,q.y-200,10,200);ctx.strokeStyle='#ebdfa7';ctx.beginPath();ctx.arc(q.x,q.y,12,0,Math.PI*2);ctx.stroke();}for(const g of s.map.generators)if(Math.hypot(g.x-b.x,g.y-b.y)<32*s.config.pixelsPerMeter)marker(g,'','#e9c898','generator');}
     if(view.keyReading)for(const p of s.players)if(p.id!==view.id&&p.role==='survivor'&&p.x!=null&&Math.hypot(view.x-p.x,view.y-p.y)<s.config.keyRange&&!['out','escaped'].includes(p.status)){const q=projectMarker(p,camera,W,H);if(!q.offscreen){ctx.strokeStyle='#f1d6a0';ctx.lineWidth=3;ctx.strokeRect(q.x-14,q.y-24,28,44);}}
   }
   if(view.role==='survivor')for(const p of s.players)if(p.id!==view.id&&p.role==='survivor'&&p.x!=null){if(p.status==='caged')marker(p,`${p.name} · ${p.hookStage}단계`,'#ff647d','hook',true);else if(p.status==='down'||view.status==='down'&&p.status==='alive'){const q=projectMarker(p,camera,W,H);if(!q.offscreen){ctx.strokeStyle='#dacaaa';ctx.beginPath();ctx.arc(q.x,q.y,21,0,7);ctx.stroke();text(p.name,q.x,q.y-29,'#dacaaa',12);}}}
 }
 return {floor,terrain,objects,players,visibility,skill,auras,resetSkill:skillPresentation.reset};
}
export function projectMarker(p,camera,W,H){
 const dx=p.x-camera.x,dy=p.y-camera.y,rx=Math.max(1,W/2-48),ry=Math.max(1,H/2-Math.min(112,H*.22)),factor=Math.min(1,rx/Math.max(.001,Math.abs(dx)),ry/Math.max(.001,Math.abs(dy)));
 const edge=Math.abs(dx)/rx>Math.abs(dy)/ry?(dx<0?'left':'right'):(dy<0?'top':'bottom');return {edge,x:W/2+dx*factor,y:H/2+dy*factor,angle:Math.atan2(dy,dx),offscreen:factor<1,distance:Math.hypot(dx,dy)};
}
