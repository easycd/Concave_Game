export function smoothAngle(current,target,dt,response=32){
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  if(Math.abs(delta)<.00001)return current+delta;
  return current+delta*(1-Math.exp(-Math.max(0,Math.min(.1,dt))*response));
}
export function penetration(x,y,r,w){
  const dx=x-Math.max(w.x,Math.min(w.x+w.w,x)),dy=y-Math.max(w.y,Math.min(w.y+w.h,y));
  if(dx||dy)return Math.max(0,r-Math.hypot(dx,dy));
  return r+Math.min(x-w.x,w.x+w.w-x,y-w.y,w.y+w.h-y);
}
export function blocksMovement(from,to,r,w){
  if(to.x+r<=w.x||to.x-r>=w.x+w.w||to.y+r<=w.y||to.y-r>=w.y+w.h)return false;
  const after=penetration(to.x,to.y,r,w);return after>1e-6&&after>penetration(from.x,from.y,r,w)+1e-6;
}
