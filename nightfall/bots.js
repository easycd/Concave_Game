// Survivor replacement AI. It navigates the same walls as human players.
export class SurvivorBots{
  constructor(room){this.room=room;this.seed=null;this.paths=new Map();}
  rebuild(){
    const m=this.room.map;this.seed=m.seed;this.step=40;this.width=Math.ceil(m.width/40);this.height=Math.ceil(m.height/40);this.solid=new Set();
    for(const w of [...m.walls,...m.windows])for(let y=Math.max(0,Math.floor((w.y-15)/40));y<Math.min(this.height,Math.ceil((w.y+w.h+15)/40));y++)for(let x=Math.max(0,Math.floor((w.x-15)/40));x<Math.min(this.width,Math.ceil((w.x+w.w+15)/40));x++){
      const px=x*40+20,py=y*40+20;
      if(Math.hypot(px-Math.max(w.x,Math.min(w.x+w.w,px)),py-Math.max(w.y,Math.min(w.y+w.h,py)))<15)this.solid.add(y*this.width+x);
    }
  }
  route(p,target){
    if(this.seed!==this.room.map.seed)this.rebuild();
    const w=this.width,cell=q=>Math.floor(q.y/40)*w+Math.floor(q.x/40),start=cell(p),goal=cell(target),queue=[start],parent=new Map([[start,null]]);
    let found=null;
    for(let i=0;i<queue.length;i++){
      const n=queue[i],x=n%w,y=Math.floor(n/w);
      if(n===goal||Math.hypot(x*40+20-target.x,y*40+20-target.y)<55){found=n;break;}
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy,k=ny*w+nx;
        if(nx<1||ny<1||nx>=w-1||ny>=this.height-1||this.solid.has(k)||parent.has(k))continue;
        const cx=nx*40+20,cy=ny*40+20;
        if(this.room.map.pallets.some(o=>o.state==='dropped'&&cx>o.x-15&&cx<o.x+o.w+15&&cy>o.y-15&&cy<o.y+o.h+15))continue;
        parent.set(k,n);queue.push(k);
      }
    }
    const path=[];if(found!==null)for(let n=found;n!==start&&n!==null;n=parent.get(n))path.push({x:n%w*40+20,y:Math.floor(n/w)*40+20});
    return path.reverse();
  }
  frame(p){
    const r=this.room;
    p.input={x:0,y:0,space:false,work:false,run:false,crouch:false,attack:false,item:false,self:false,drop:false,aimX:1,aimY:0};
    if(p.skill){const t=(r.elapsed-p.skill.start)/p.skill.duration;const zone=p.skill.good;
      if(t>=zone[0]&&t<=zone[1])p.input.space=true;
    }
    if(p.status==='caged'){p.input.self=p.resolve>=1;return;}
    if(p.status!=='alive')return;
    if(p.hidden){p.input.space=!p.previous.space;return;}
    const nearest=list=>list.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    const k=[...r.players.values()].find(q=>q.role==='killer');
    const rescue=nearest([...r.players.values()].filter(q=>q.id!==p.id&&q.status==='caged'));
    const heal=nearest([...r.players.values()].filter(q=>q.id!==p.id&&q.status==='down'));
    let target;
    if(r.map.hatch.visible&&r.map.hatch.open)target=r.map.hatch;
    else if(r.powered()||r.endgame!==null)target=nearest([...r.map.exits]);
    else if(rescue&&(!k||Math.hypot(rescue.x-k.x,rescue.y-k.y)>250))target=rescue;
    else if(heal)target=heal;
    else target=nearest(r.map.generators.filter(g=>g.progress<90));
    if(!target)return;
    const danger=k&&Math.hypot(p.x-k.x,p.y-k.y)<250;
    if(danger){
      const pal=r.near(p,r.map.pallets.filter(o=>o.state==='ready'),65);if(pal)p.input.space=true;
      const away={x:p.x+(p.x-k.x)*2,y:p.y+(p.y-k.y)*2};target={x:Math.max(30,Math.min(r.map.width-30,away.x)),y:Math.max(30,Math.min(r.map.height-30,away.y))};
    }
    if(!danger&&Math.hypot(target.x-p.x,target.y-p.y)<50){p.input.work=true;return;}
    let cached=this.paths.get(p.id);
    if(!cached||r.elapsed-cached.time>1||Math.hypot(cached.target.x-target.x,cached.target.y-target.y)>80){cached={target:{...target},time:r.elapsed,path:this.route(p,target)};this.paths.set(p.id,cached);}
    while(cached.path.length&&Math.hypot(cached.path[0].x-p.x,cached.path[0].y-p.y)<12)cached.path.shift();
    const next=cached.path[0];if(!next)return;
    const dx=next.x-p.x,dy=next.y-p.y,d=Math.max(1,Math.hypot(dx,dy));p.input.x=dx/d;p.input.y=dy/d;p.input.run=danger;
  }
}
