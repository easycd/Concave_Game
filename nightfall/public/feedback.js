const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};

// One clock drives both heart sizes and the two audio impulses, even while muted.
export function createFeedbackPresentation(){
  let key=null,lastNow=null,strength=0,direction=null,cycle=0,second=false,hitSequence=0,hitStarted=-Infinity,lastElapsed=0;
  function reset(){key=null;lastNow=null;strength=0;direction=null;cycle=0;second=false;hitStarted=-Infinity;}
  function frame(s,now,reduced=false){
    const view=s?.players.find(p=>p.id===s.viewId);
    if(s?.phase!=='playing'||view?.role!=='survivor'||!['alive','down','caged','carried'].includes(view.status)){reset();return {strength:0,edge:0,hit:0,pulse:0,beat:0,direction:null};}
    const nextKey=s.code+':'+view.id;
    if(key!==nextKey||s.elapsed<lastElapsed){reset();key=nextKey;hitSequence=s.hit?.sequence||0;}
    lastElapsed=s.elapsed;
    const dt=lastNow===null?0:clamp((now-lastNow)/1000,0,.1);lastNow=now;
    const target=s.heartbeat||0;
    strength+=(target-strength)*(1-Math.exp(-dt/0.22));if(strength<.001&&target===0)strength=0;
    direction=null;
    if(s.hit?.sequence!==undefined&&s.hit.sequence!==hitSequence){
      hitSequence=s.hit.sequence;
      const age=s.elapsed-s.hit.time;
      if(s.hit.time!==null&&age>=0&&age<.5)hitStarted=now-age*1000;
    }
    const age=(now-hitStarted)/1000,hit=age<0||age>=.5?0:.25*smooth(age/.035)*(1-smooth((age-.035)/.465));
    const interval=1.25-.8*strength;
    let beat=0;
    if(strength===0){cycle=0;second=false;direction=null;}
    else if(cycle===0||now-cycle>=interval*1000){cycle=now;second=false;beat=1;}
    const phase=(now-cycle)/1000;
    if(strength>0&&!second&&phase>=.18){second=true;beat=2;}
    const bump=(t,width)=>t>=0&&t<width?Math.sin(Math.PI*t/width):0;
    const pulse=reduced?0:.35*bump(phase,.16)+.65*bump(phase-.18,.22);
    const edge=0;
    return {strength,edge,hit,pulse,beat,direction};
  }
  return {frame,reset};
}

export function createFeedback({heart,edge,hitOverlay}){
  const presentation=createFeedbackPresentation(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let active=document.createElement('div'),previous=document.createElement('div');
  active.className=previous.className='terror-field';edge.replaceChildren(previous,active);
  let lastDirection=null,lastView=null,changedAt=0,lastW=0,lastH=0;
  function frame(s,now,W,H){
    const f=presentation.frame(s,now,reduced.matches),view=s?.players.find(p=>p.id===s.viewId);
    heart.hidden=!f.strength||view?.x==null;
    if(!heart.hidden){
      // The interpolated camera follows the watched character at screen center.
      if(W!==lastW||H!==lastH){heart.style.left=(W/2)+'px';heart.style.top=(H/2+36)+'px';lastW=W;lastH=H;}
      heart.style.opacity=(.15+.75*f.strength)*(1-f.hit/.25);
      heart.style.transform=`translate(-50%,0) scale(${.65+.5*f.strength+f.pulse*(.2+.3*f.strength)})`;
    }
    edge.style.opacity=f.edge*.46;
    // Rasterize only when the coarse direction changes, then crossfade the two
    // fixed images. Changing a full-screen gradient every frame forces repaint.
    if(f.direction!==null&&(f.direction!==lastDirection||lastView!==s.viewId)){
      [previous,active]=[active,previous];
      const a=f.direction*Math.PI/4;
      active.style.background=`radial-gradient(ellipse at ${50+Math.cos(a)*50}% ${50+Math.sin(a)*50}%, #be1428, transparent 67%)`;
      changedAt=lastDirection===null||lastView!==s.viewId?now-180:now;lastDirection=f.direction;
    }
    const blend=clamp((now-changedAt)/180);active.style.opacity=blend;previous.style.opacity=1-blend;
    edge.hidden=f.edge===0;hitOverlay.hidden=f.hit===0;
    if(!f.strength)lastDirection=null;
    lastView=s?.viewId;
    hitOverlay.style.opacity=f.hit;
    return f;
  }
  return {frame,reset:presentation.reset};
}
