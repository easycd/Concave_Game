const intersects=(a,b,pad=0)=>a.x+pad>b.left&&a.x-pad<b.right&&a.y+pad>b.top&&a.y-pad<b.bottom;
// Preserve the target arrow direction, but route crowded icons around occupied HUD.
export function placeEdgeMarker(q,W,H,reserved=[],occupied=[]){
 const candidates=[q],step=36;
 for(let y=100;y<=H-40;y+=step)for(const [edge,x]of [['left',48],['right',W-48]])candidates.push({x,y,edge});
 for(let x=48;x<=W-48;x+=step)for(const [edge,y]of [['top',100],['bottom',H-28]])candidates.push({x,y,edge});
 const free=candidates.filter(p=>!reserved.some(r=>intersects(p,r,22))&&!occupied.some(o=>Math.hypot(o.x-p.x,o.y-p.y)<34));
 free.sort((a,b)=>(Math.hypot(a.x-q.x,a.y-q.y)+(a.edge===q.edge?0:100))-(Math.hypot(b.x-q.x,b.y-q.y)+(b.edge===q.edge?0:100)));
 const chosen=free[0];return chosen?{...q,x:chosen.x,y:chosen.y}:q;
}
