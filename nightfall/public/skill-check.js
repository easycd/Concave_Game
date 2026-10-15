const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Presentation only: the server still owns timing and success/failure.
export function createSkillCheckPresentation(){
  let last=null,owner=null,fadeStart=null;
  const reset=()=>{last=null;owner=null;fadeStart=null;};
  function frame(s,p,W,H,snapshotAge,camera,now,reducedMotion=false){
    if(s?.phase!=='playing'||!p){reset();return null;}
    if(owner!==p.id){reset();owner=p.id;}
    if(p.skill){
      const c=p.skill;
      const generator=c.type==='repair'?s.map.generators.find(g=>g.id===c.target):null;
      last={check:c,phase:clamp((s.elapsed+snapshotAge-c.start)/c.duration,0,1),anchor:generator?{x:generator.x,y:generator.y}:null};
      fadeStart=null;
    }else if(last){
      fadeStart??=now;
      if(reducedMotion||now-fadeStart>=250){last=null;return null;}
    }
    if(!last)return null;
    const fade=fadeStart===null?0:clamp((now-fadeStart)/250,0,1);
    let x=W/2,y=H*.62;
    if(last.anchor){
      x=last.anchor.x-camera.x+W/2+108;
      y=last.anchor.y-camera.y+H/2-78;
    }
    // Keep the circle and its caption inside the viewport and below the top HUD.
    x=clamp(x,Math.min(78,W/2),Math.max(W/2,W-78));
    y=clamp(y,Math.min(150,H/2),Math.max(H/2,H-105));
    return {...last,x,y,opacity:(1-fade)**2};
  }
  return {frame,reset};
}
