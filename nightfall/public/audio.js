export function createAudio({getState,getMyId,button}){
 let context=null,enabled=localStorage.getItem('nightfall-sound')!=='off',lastBeat=0,lastSkill='',noises=new Set(),ambient=new Map();
 const updateButton=()=>{button.textContent=enabled?'소리 켜짐':'소리 꺼짐';button.setAttribute('aria-pressed',String(enabled));};
 const unlock=async()=>{if(enabled){context??=new AudioContext();await context.resume();}};
 addEventListener('pointerdown',unlock);addEventListener('keydown',unlock);updateButton();
 button.onclick=async()=>{enabled=!enabled;localStorage.setItem('nightfall-sound',enabled?'on':'off');await unlock();updateButton();};
 function tone(frequency,duration,volume=.12,type='sine',delay=0){if(!context)return;const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+delay;o.type=type;o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+duration+.01);}
 function frame(now){if(!enabled||!context||context.state!=='running')return;const s=getState();if(s?.phase!=='playing')return;const own=s.players.find(p=>p.id===getMyId());if(!own)return;const heart=s.heartbeat||0;if(heart>0&&now-lastBeat>1100-heart*650){lastBeat=now;tone(65,.12,.08+heart*.12);tone(52,.14,.06+heart*.1,'sine',.18);}const key=own.skill?own.skill.type+own.skill.start:'';if(key&&key!==lastSkill)tone(920,.13,.12);lastSkill=key;const visible=s.noises||[];for(const n of visible)if(!noises.has(n.id)){tone(140,.18,.09,'triangle');noises.add(n.id);}if(noises.size>50)noises=new Set(visible.map(n=>n.id));}
 const basicFrame=frame;
 function ambientFrame(now){
   basicFrame(now);if(!enabled||!context||context.state!=='running')return;
   const s=getState();if(s?.phase!=='playing')return;
   for(const a of s.audio||[]){const key=a.id+a.kind,interval=a.kind==='pain'?1700:a.running?330:570;if(now-(ambient.get(key)||0)<interval)continue;ambient.set(key,now);
     const osc=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner(),t=context.currentTime,duration=a.kind==='pain'?.35:.07;
     osc.type=a.kind==='pain'?'triangle':'sine';osc.frequency.setValueAtTime(a.kind==='pain'?130:85,t);osc.frequency.exponentialRampToValueAtTime(a.kind==='pain'?65:45,t+duration);
     gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.002,a.volume*(a.kind==='pain'?.06:.09)),t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);pan.pan.value=a.pan;
     osc.connect(gain);gain.connect(pan);pan.connect(context.destination);osc.start(t);osc.stop(t+duration+.01);
   }
   if(ambient.size>100)ambient=new Map();
   const own=s.players.find(p=>p.id===getMyId()),killer=s.players.find(p=>p.role==='killer');
   if(own?.role==='survivor'&&killer?.chaseTarget===own.id&&now-(ambient.get('chase')||0)>550){ambient.set('chase',now);tone(92,.2,.035,'sawtooth');}
   if(s.map.hatch.visible&&s.map.hatch.open&&own?.x!=null){const d=Math.hypot(own.x-s.map.hatch.x,own.y-s.map.hatch.y),r=16*s.config.pixelsPerMeter;if(d<r&&now-(ambient.get('hatch')||0)>900){ambient.set('hatch',now);tone(180,.65,.055*(1-d/r),'triangle');}}
 }
 return {frame:ambientFrame};
}
