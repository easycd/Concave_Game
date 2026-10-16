export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function attackRecoveryMultiplier(kind,remaining,duration){
  const t=clamp(1-remaining/duration,0,1),floor=kind==='miss'?.25:.125;
  if(t<.25)return .5-(.5-floor)*(t/.25)**3;
  if(t<=.75)return floor;
  return floor+(.5-floor)*((t-.75)/.25)**3;
}
export function skillProfile(type,random=Math.random){
  if(type==='wiggle')return {duration:1.2,good:[.2,.8],great:[.4,.6],pingPong:true};
  const width=type==='repair'?.16:.18,start=.34+random()*(.92-.34-width);
  return {duration:type==='repair'?1.1:1.2,good:[start,start+width],great:[start,start+.03]};
}
export const ITEMS={none:{charge:0},medkit:{charge:24},toolbox:{charge:32},flashlight:{charge:8},key:{charge:5},map:{charge:5}};
export function campRate(meters,nearbySurvivors,seconds){
  if(meters>=16)return 0;
  const proximity=meters<=1?1:Math.max(0,(16-meters)/15);
  const multiplier=seconds>=20?4:seconds>=10?2:1;
  return Math.max(0,proximity-nearbySurvivors*.333)/40*multiplier;
}

// Reference baseline: one independent roll per second, no progress-based guarantee.
export function repairSkillChance(_progress,toolbox=false){return toolbox?.4:.08;}

export function diminishingReturns(values){return [...values].sort((a,b)=>Math.abs(b)-Math.abs(a)).reduce((sum,value,i)=>sum+value*([1,.5,.25,.125][i]??.05),0);}
