export function createAudio({getState,getMyId,button}){
 let context=null,master=null,enabled=false,lastSkill='',noises=new Set(),ambient=new Map(),lastRoom=null,lastElapsed=0;
 try{enabled=localStorage.getItem('nightfall-sound')==='on';}catch{}
 const updateButton=()=>{button.textContent=enabled?'소리 켜짐':'소리 꺼짐';button.setAttribute('aria-pressed',String(enabled));};
 const unlock=async()=>{
   if(!enabled)return;
   try{
     if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);}
     await context.resume();master.gain.setValueAtTime(enabled?1:0,context.currentTime);
   }catch{enabled=false;updateButton();}
 };
 addEventListener('pointerdown',unlock);addEventListener('keydown',unlock);updateButton();
 button.onclick=async()=>{
   enabled=!enabled;if(master)master.gain.setValueAtTime(enabled?1:0,context.currentTime);
   await unlock();try{localStorage.setItem('nightfall-sound',enabled?'on':'off');}catch{}updateButton();
 };
 function tone(frequency,duration,volume=.12,type='sine'){
   const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;
   o.type=type;o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);
   o.connect(g);g.connect(master);o.onended=()=>{o.disconnect();g.disconnect();};o.start(t);o.stop(t+duration+.01);
 }
 function frame(now,feedback){
   if(!enabled||!context||context.state!=='running'||document.hidden)return;
   const s=getState();if(s?.phase!=='playing')return;
   const own=s.players.find(p=>p.id===getMyId()),view=s.players.find(p=>p.id===s.viewId);if(!own||!view)return;
   if(lastRoom!==s.code||s.elapsed<lastElapsed){lastRoom=s.code;lastSkill='';noises.clear();ambient.clear();}lastElapsed=s.elapsed;
   const heart=feedback?.strength||0;
   if(feedback?.beat===1)tone(65,.12,.015+heart*.15);
   if(feedback?.beat===2)tone(52,.14,.012+heart*.12);
   const key=own.skill?own.skill.type+own.skill.start:'';if(key&&key!==lastSkill)tone(920,.13,.12);lastSkill=key;
   const visible=s.noises||[];for(const n of visible)if(!noises.has(n.id)){tone(140,.18,.09,'triangle');noises.add(n.id);}if(noises.size>50)noises=new Set(visible.map(n=>n.id));
   for(const a of s.audio||[]){
     const key=a.id+a.kind,interval=a.kind==='pain'?1700:a.running?330:570;if(now-(ambient.get(key)||0)<interval)continue;ambient.set(key,now);
     const osc=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner(),t=context.currentTime,duration=a.kind==='pain'?.35:.07;
     osc.type=a.kind==='pain'?'triangle':'sine';osc.frequency.setValueAtTime(a.kind==='pain'?130:85,t);osc.frequency.exponentialRampToValueAtTime(a.kind==='pain'?65:45,t+duration);
     gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.002,a.volume*(a.kind==='pain'?.06:.09)),t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);pan.pan.value=a.pan;
     osc.connect(gain);gain.connect(pan);pan.connect(master);osc.onended=()=>{osc.disconnect();gain.disconnect();pan.disconnect();};osc.start(t);osc.stop(t+duration+.01);
   }
   if(ambient.size>100)ambient.clear();
   const killer=s.players.find(p=>p.role==='killer');
   if(view.role==='survivor'&&killer?.chaseTarget===view.id&&now-(ambient.get('chase')||0)>550){ambient.set('chase',now);tone(92,.2,.035,'sawtooth');}
   if(s.map.hatch.visible&&s.map.hatch.open&&view.x!=null){const d=Math.hypot(view.x-s.map.hatch.x,view.y-s.map.hatch.y),r=16*s.config.pixelsPerMeter;if(d<r&&now-(ambient.get('hatch')||0)>900){ambient.set('hatch',now);tone(180,.65,.055*(1-d/r),'triangle');}}
 }
 return {frame};
}
