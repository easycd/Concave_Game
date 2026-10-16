export const LOADING_TIPS=[
  'WASD로 이동하고 마우스로 시선을 돌리세요. 등 뒤는 보이지 않습니다.',
  '생존자는 E를 길게 눌러 수리·치료·구출을 합니다.',
  'SPACE는 파레트·창문을 사용하고 스킬 체크를 맞추는 키입니다.',
  'SHIFT로 달리면 빨간 흔적이 남습니다. CTRL로 조용히 움직이세요.',
  '7개 발전기 중 5개를 수리한 뒤 출구 스위치를 20초 작동하세요.',
  '파레트는 한 번만 쓰러뜨릴 수 있습니다. 다음 도주 경로를 생각하세요.',
  '살인마는 왼쪽 클릭으로 공격하고, 길게 누르면 돌진합니다.',
  '살인마는 E로 빈사 생존자를 들어 올리고 갈고리에 겁니다.',
  '동료의 갈고리 단계와 활동은 왼쪽 HUD에서 확인하세요.',
  '심장 소리가 빨라지면 살인마가 가까이 있습니다.',
  '빈사 상태에서 멈추면 95%까지 회복합니다. 동료의 도움이 필요합니다.',
  '구출 후 인내는 무적이 아닙니다. 안전한 곳으로 이동하세요.'
];
export function loadingPresentation(state,age=0){
  const duration=state.config.loadingSeconds||10,remaining=Math.max(0,(state.loadingRemaining??duration)-Math.max(0,Math.min(.2,age)));
  const elapsed=duration-remaining,seed=state.loadingTipSeed??0;
  const tip=LOADING_TIPS[(seed+Math.floor(elapsed/3))%LOADING_TIPS.length].replace('7개 발전기 중 5개',`${state.map?.generators?.length??7}개 발전기 중 ${state.generatorGoal??5}개`);
  return {remaining,progress:Math.min(1,Math.max(0,elapsed/duration)),tip};
}
