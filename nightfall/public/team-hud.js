export const ACTIVITY_LABELS={repair:'발전기 수리',heal:'동료 치료',selfHeal:'자가 치료',mend:'깊은 상처 치유',rescue:'갈고리 구출',gate:'출구 개방',chest:'상자 수색',totem:'토템 정화',sabotage:'갈고리 방해',recover:'자가 회복',crawl:'기어가는 중',pickup:'들어 올려지는 중',wiggle:'운반 저항',hooked:'갈고리 · Resolve',locker:'캐비넷 은신',vault:'장애물 넘기',flashlight:'손전등 사용',map:'지도 읽기',key:'열쇠 사용',interact:'상호작용',move:'이동 중',idle:'대기'};
const paths={repair:'M4 7h16v13H4z M8 7V3m8 4V3M8 12h8m-8 4h8',heal:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',chase:'m13 3-3 7 6 2-3 9M5 14l5-4M16 12l4 3M9 5l-4 4',default:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2'};
function icon(type){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[type]||paths.default);svg.append(path);return svg;}
export function activityElement(activity){
  const box=document.createElement('div');box.className='team-activity';
  if(!activity)return box;
  const label=ACTIVITY_LABELS[activity.type]||'상호작용',hasProgress=activity.progress!==null;
  box.dataset.activity=activity.type;box.append(icon(['heal','selfHeal','mend','rescue'].includes(activity.type)?'heal':activity.type));
  const text=document.createElement('span');text.textContent=label+(hasProgress?' · '+Math.round(activity.progress*100)+'%':'');box.append(text);
  if(activity.chased){const chase=document.createElement('b');chase.className='chase-badge';chase.append(icon('chase'),document.createTextNode('추격'));box.append(chase);}
  if(hasProgress){const track=document.createElement('div'),fill=document.createElement('i');track.className='team-activity-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label',label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(activity.progress*100)));fill.style.transform=`scaleX(${activity.progress})`;track.append(fill);box.append(track);}
  return box;
}
