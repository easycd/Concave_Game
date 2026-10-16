export function viewAngle(view){return Math.atan2(view.facing?.y||0,view.facing?.x??1);}
export function viewFov(view,config){return (view.role==='killer'?config.killerFov:config.survivorFov)*Math.PI/180;}
export function rayDistance(origin,angle,wall,max){
  const dx=Math.cos(angle),dy=Math.sin(angle);let near=0,far=max;
  for(const [v,d,min,size]of [[origin.x,dx,wall.x,wall.w],[origin.y,dy,wall.y,wall.h]]){
    if(Math.abs(d)<1e-10){if(v<min||v>min+size)return max;continue;}
    let a=(min-v)/d,b=(min+size-v)/d;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return max;
  }
  return near>0?Math.min(max,near):max;
}
export function canSee(map,view,target,config){
  const dx=target.x-view.x,dy=target.y-view.y,d=Math.hypot(dx,dy),radius=config.survivorVision*(view.role==='killer'?config.killerVisionMultiplier:1);
  if(d>radius)return false;if(d<.01)return true;
  const a=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(a-viewAngle(view)),Math.cos(a-viewAngle(view)));
  if(Math.abs(delta)>viewFov(view,config)/2)return false;
  return !map.walls.some(w=>rayDistance(view,a,w,d)<d-.01);
}
export function visionPolygon(map,view,radius,fov){
  const angle=viewAngle(view),half=fov/2,angles=[];
  const walls=map.walls.filter(w=>w.x<=view.x+radius&&w.x+w.w>=view.x-radius&&w.y<=view.y+radius&&w.y+w.h>=view.y-radius);
  for(let i=0;i<=60;i++)angles.push(-half+fov*i/60);
  for(const w of walls)for(const [x,y]of [[w.x,w.y],[w.x+w.w,w.y],[w.x,w.y+w.h],[w.x+w.w,w.y+w.h]]){
    const a=Math.atan2(y-view.y,x-view.x)-angle,delta=Math.atan2(Math.sin(a),Math.cos(a));
    for(const offset of [-.0001,0,.0001])if(Math.abs(delta+offset)<half)angles.push(delta+offset);
  }
  angles.sort((a,b)=>a-b);
  return angles.map(delta=>{const a=angle+delta;let d=radius;for(const w of walls)d=Math.min(d,rayDistance(view,a,w,radius));return {x:view.x+Math.cos(a)*d,y:view.y+Math.sin(a)*d,delta};});
}
