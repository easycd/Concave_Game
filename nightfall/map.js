import { randomInt } from 'node:crypto';
import { CONFIG as C } from './config.js';

// Seeded, constrained generation: fixed gates, changing geometry and balanced objectives.
export function createMap(seed=randomInt(1,2147483646)) {
  let v=seed;const rand=()=>((v=v*16807%2147483647)-1)/2147483646;
  const range=(a,b)=>a+rand()*(b-a),pick=a=>a[Math.floor(rand()*a.length)];
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const m={seed,name:'ASHEN HOLLOW · 잿빛 폐허 숲',width:C.mapWidth,height:C.mapHeight,walls:[],windows:[],pallets:[],structures:[],bushes:[],cabinets:[],cages:[],generators:[],exits:[],decor:[],zones:[],paths:[],chests:[],items:[],totems:[],hatch:null,spawns:[],killerSpawn:null};
  const clearings=[],occupied=[];
  const reserve=(x,y,w,h)=>clearings.push({x,y,w,h});
  const wall=(x,y,w,h,material='wood')=>m.walls.push({id:`w${m.walls.length}`,x,y,w,h,material});
  const window=(x,y,w,h,axis)=>m.windows.push({id:`v${m.windows.length}`,x,y,w,h,axis});
  const pallet=(x,y,w=90,h=24,axis='y')=>m.pallets.push({id:`p${m.pallets.length}`,x,y,w,h,axis,state:'ready',breakProgress:0});
  // Closed perimeters with two walkable doors and at most one additional window.
  const structure=(x,y,w,h,count,material,id)=>{
    const thickness=24,gap=110,top=w*.3,bottom=w*.62,windowY=h*.36,first=m.walls.length;
    wall(x,y,top,thickness,material);wall(x+top+gap,y,w-top-gap,thickness,material);
    wall(x,y+h-thickness,bottom,thickness,material);wall(x+bottom+gap,y+h-thickness,w-bottom-gap,thickness,material);
    wall(x,y+thickness,thickness,h-thickness*2,material);
    const openings=[{x:x+top,y,w:gap,h:thickness,type:'door'},{x:x+bottom,y:y+h-thickness,w:gap,h:thickness,type:'pallet'}];
    if(count===3){wall(x+w-thickness,y+thickness,thickness,windowY-thickness,material);wall(x+w-thickness,y+windowY+90,thickness,h-thickness-windowY-90,material);window(x+w-thickness,y+windowY,thickness,90,'x');openings.push({x:x+w-thickness,y:y+windowY,w:thickness,h:90,type:'window'});}
    else wall(x+w-thickness,y+thickness,thickness,h-thickness*2,material);
    pallet(x+bottom,y+h-thickness,gap,thickness);
    const result={id,x,y,w,h,openings,wallIds:m.walls.slice(first).map(w=>w.id)};m.structures.push(result);return result;
  };
  const locker=p=>m.cabinets.push({id:`l${m.cabinets.length}`,...p,occupant:null,searchProgress:0});
  const trail=(x1,y1,x2,y2,width=82)=>m.paths.push({x:Math.min(x1,x2)-width/2,y:Math.min(y1,y2)-width/2,w:Math.abs(x2-x1)+width,h:Math.abs(y2-y1)+width});
  const inside=(x,y,r,p)=>x+r>p.x&&x-r<p.x+p.w&&y+r>p.y&&y-r<p.y+p.h;
  const collides=(x,y,r,p)=>Math.hypot(x-Math.max(p.x,Math.min(p.x+p.w,x)),y-Math.max(p.y,Math.min(p.y+p.h,y)))<r;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const region=p=>(p.y<m.height/2?0:3)+Math.min(2,Math.floor(p.x/(m.width/3)));
  const quadrant=p=>(p.y<m.height/2?0:2)+(p.x<m.width/2?0:1);
  for(let row=0;row<2;row++)for(let col=0;col<3;col++)m.zones.push({x:70+col*m.width/3,y:70+row*m.height/2,w:m.width/3-140,h:m.height/2-140,type:'forest',name:['검은 소나무 군락','안개 낀 자작나무 숲','사슴이 사라진 숲','고사목 늪지','이끼 바위 숲','버려진 벌목 구역'][row*3+col]});
  const mainY=m.height/2+range(-130,130),trailRows=[range(220,400),range(1180,1400),mainY,range(2520,2760),range(3650,3860)];
  for(const y of trailRows)trail(90,y,m.width-90,y,y===mainY?100:82);
  for(const x of [range(930,1180),range(2080,2330),range(3180,3440)])trail(x,100,x,m.height-100,84);
  m.exits=[{x:65,y:m.height/2},{x:m.width-65,y:m.height/2}].map((p,i)=>({...p,id:`e${i}`,progress:0,open:false}));
  for(const e of m.exits){const x=e.x<m.width/2?240:m.width-240;trail(e.x,e.y,x,e.y,100);trail(x,e.y,x,mainY,100);}
  const cells=[];for(let row=0;row<6;row++)for(let col=0;col<6;col++)cells.push({x:140+(col+.5)*(m.width-280)/6+range(-35,35),y:140+(row+.5)*(m.height-280)/6+range(-30,30),col,row});
  const claimed=new Set();
  const selectCell=list=>{const cell=pick(list.filter(c=>!claimed.has(c)));claimed.add(cell);return cell;};
  const buildings=[];
  const firstHouseSouth=rand()<.5;
  for(let col=0;col<3;col++)buildings.push(selectCell(cells.filter(c=>Math.floor(c.col/2)===col&&(col===2||(c.row>=3)===(col===0?firstHouseSouth:!firstHouseSouth)))));
  shuffle(buildings);
  for(let i=0;i<buildings.length;i++){
    const cell=buildings[i],w=[620,360,390][i],h=[470,300,330][i],x=cell.x-w/2,y=cell.y-h/2;
    const starts=[m.walls.length,m.windows.length,m.pallets.length];
    m.zones.push({x,y,w,h,type:'building',name:['숲지기 산장','사냥 오두막','버려진 벌목 쉼터'][i]});reserve(x-65,y-65,w+130,h+130);
    const shape=structure(x,y,w,h,i===1?2:3,'wood',`house${i}`);
    // Mirror the perimeter and its opening metadata together.
    if(rand()<.5){for(const [j,list]of [m.walls,m.windows,m.pallets].entries())for(const p of list.slice(starts[j]))p.x=2*cell.x-p.x-p.w;for(const p of shape.openings)p.x=2*cell.x-p.x-p.w;}
    const door=m.pallets.at(-1);trail(door.x+door.w/2,door.y+65,door.x+door.w/2,trailRows.reduce((a,b)=>Math.abs(b-door.y)<Math.abs(a-door.y)?b:a),64);
  }
  const loops=[];for(let r=0;r<6;r++)for(let j=0;j<2;j++)loops.push(selectCell(cells.filter(c=>region(c)===r)));
  shuffle(loops);
  for(const [index,cell]of loops.entries()){
    const starts=[m.walls.length,m.windows.length,m.pallets.length],kind=Math.floor(rand()*3),turn=Math.floor(rand()*4),width=[360,390,400][kind],height=[280,300,270][kind];
    const shape=structure(-width/2,-height/2,width,height,index%3===0?2:3,kind===1?'wood':'stone',`loop${index}`);
    const transform=p=>{let x=p.x+p.w/2,y=p.y+p.h/2;for(let t=0;t<turn;t++)[x,y]=[-y,x];if(turn%2){[p.w,p.h]=[p.h,p.w];if(p.axis)p.axis=p.axis==='x'?'y':'x';}p.x=cell.x+x-p.w/2;p.y=cell.y+y-p.h/2;};
    for(const [j,list]of [m.walls,m.windows,m.pallets].entries())for(const p of list.slice(starts[j]))transform(p);
    for(const p of shape.openings)transform(p);shape.x=cell.x-(turn%2?height:width)/2;shape.y=cell.y-(turn%2?width:height)/2;shape.w=turn%2?height:width;shape.h=turn%2?width:height;
    reserve(cell.x-265,cell.y-265,530,530);
    trail(cell.x,cell.y+265,cell.x,trailRows.reduce((a,b)=>Math.abs(b-cell.y)<Math.abs(a-cell.y)?b:a),64);
  }
  // Pads are regenerated with the cell geometry, then checked against every structure.
  const pads=[];for(const cell of cells)for(const dy of [-210,-105,0,105,210])for(const dx of [-210,-105,0,105,210])pads.push({x:cell.x+dx+range(-18,18),y:cell.y+dy+range(-18,18),cell});
  const safe=p=>p.x>60&&p.y>60&&p.x<m.width-60&&p.y<m.height-60&&![...m.walls,...m.windows,...m.pallets].some(w=>collides(p.x,p.y,48,w));
  const safePads=pads.filter(safe);
  const sample=(filter=()=>true,siblings=[],spacing=0)=>{
    const p=shuffle(safePads.filter(p=>filter(p)&&occupied.every(q=>distance(p,q)>=115)&&siblings.every(q=>distance(p,q)>=spacing)))[0];
    if(!p)throw new Error(`No safe layout position for seed ${seed}`);
    const point={x:p.x,y:p.y};occupied.push(point);reserve(point.x-105,point.y-105,210,210);
    const y=trailRows.reduce((a,b)=>Math.abs(b-point.y)<Math.abs(a-point.y)?b:a);trail(point.x,point.y,point.x,y,64);return point;
  };
  for(const cell of [...buildings,...loops])locker(sample(p=>p.cell===cell));locker(sample());
  // Ring ordering keeps prefixes for 2/3-survivor games spread as well as the full seven.
  const ring=[0,1,2,5,4,3],offset=Math.floor(rand()*6),reverse=rand()<.5?-1:1,gens=[];
  for(let i=0;i<6;i++)gens.push(sample(p=>region(p)===ring[(offset+reverse*i+12)%6],gens,600));
  gens.push(sample(p=>gens.filter(g=>(g.y<m.height/2)===(p.y<m.height/2)).length<4&&gens.filter(g=>Math.floor(g.x/(m.width/3))===Math.floor(p.x/(m.width/3))).length<3,gens,600));
  m.generators=gens.map((p,i)=>({...p,id:`g${i}`,progress:0,regressing:false,regressionCount:0,repairToStop:0,workers:[],kickProgress:0}));
  const hooks=[];for(let q=0;q<4;q++)for(let i=0;i<2;i++)hooks.push(sample(p=>quadrant(p)===q,hooks,500));
  m.cages=hooks.map((p,i)=>({...p,id:`h${i}`,occupant:null,rescueProgress:0,availableUntil:0}));
  const chests=[],firstChestSouth=rand()<.5;for(let col=0;col<3;col++)chests.push(sample(p=>Math.floor(p.x/(m.width/3))===col&&(col===2||(p.y>=m.height/2)===(col===0?firstChestSouth:!firstChestSouth)),chests,650));
  const items=shuffle(['medkit','toolbox','flashlight','key','map']);m.chests=chests.map((p,i)=>({...p,id:`ch${i}`,progress:0,opened:false,item:items[i]}));
  for(let i=0;i<5;i++)m.totems.push({...sample(),id:`t${i}`,cleansed:false});
  m.hatch={...sample(),visible:false,open:false};
  m.killerSpawn=sample(p=>p.cell.row===0||p.cell.row===5||p.cell.col===0||p.cell.col===5);
  const spawnOrder=shuffle([0,1,2,3]);for(let i=0;i<C.maxPlayers-1;i++)m.spawns.push(sample(p=>quadrant(p)===spawnOrder[i%4]&&distance(p,m.killerSpawn)>=850,m.spawns,230));
  for(const e of m.exits)reserve(e.x-110,e.y-150,220,300);
  const protectedAt=(x,y,r=45)=>clearings.some(p=>inside(x,y,r,p))||m.paths.some(p=>inside(x,y,r,p));
  for(let y=95;y<m.height-70;y+=96)for(let x=95;x<m.width-70;x+=96){
    const tx=x+range(-34,34),ty=y+range(-34,34);if(protectedAt(tx,ty,36)||rand()<.07)continue;
    const size=range(26,36);wall(tx-size/2,ty-size/2,size,size,'tree');const tree=m.walls.at(-1);tree.crown=range(58,80);tree.variant=rand()<.78?'dead':region({x:tx,y:ty})===1?'birch':'pine';tree.angle=rand()*Math.PI*2;
  }
  for(let i=0;i<1200;i++){const x=range(70,m.width-170),y=range(70,m.height-170);if(protectedAt(x,y,75))continue;m.bushes.push({id:`b${m.bushes.length}`,x,y,w:range(75,150),h:range(55,110)});}
  for(let i=0;i<9000;i++){
    const x=range(40,m.width-40),y=range(40,m.height-40);if(m.zones.some(z=>z.type==='building'&&inside(x,y,0,z)))continue;
    const onTrail=m.paths.some(p=>inside(x,y,0,p)),p=rand();m.decor.push({x,y,size:range(12,38),type:onTrail?(p<.8?'pebble':'grass'):p<.68?'grass':p<.87?'fern':p<.94?'stump':'flower',angle:rand()*Math.PI*2});
  }
  return m;
}
