export function createAccountUI({socket,getState,onAccount,onLogout}){
  const $=id=>document.getElementById(id);let account=null,register=false,wardrobe=false,busy=false;
  const defaults={survivorColor:'#657f62',killerColor:'#643e37'};
  const message=(id,text,error=false)=>{const el=$(id);el.textContent=text;el.classList.toggle('error',error);};
  async function request(route,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch('./api/'+route,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Nightfall-Request':'1'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'요청을 완료하지 못했습니다. 다시 시도해주세요.');return data;}
    catch(e){if(e.name==='AbortError')throw new Error('응답이 지연되고 있습니다. 다시 시도해주세요.');throw e;}finally{clearTimeout(timer);}
  }
  function sync(){
    const s=getState(),playing=s&&s.phase!=='lobby';
    $('account-access').hidden=!!account;$('account-bar').hidden=!account||playing;
    $('wardrobe').hidden=!account||!wardrobe||playing;
    $('entry').hidden=!account||wardrobe||!!s;
    if(s?.phase==='lobby')$('waiting').hidden=wardrobe;
    $('wardrobe-open').disabled=!!playing;
    if(!account){$('connection').textContent='● 로그인 후 연결';$('connection').dataset.status='idle';}
  }
  function renderPreview(){
    const survivor=$('survivor-color').value,killer=$('killer-color').value;
    for(const role of ['survivor','killer']){
      const canvas=$(role+'-preview'),ctx=canvas.getContext('2d'),k=role==='killer';ctx.clearRect(0,0,180,150);ctx.fillStyle='#090e0b';ctx.beginPath();ctx.ellipse(90,116,36,10,0,0,7);ctx.fill();
      ctx.fillStyle=k?killer:survivor;ctx.beginPath();ctx.roundRect(66,65,48,48,12);ctx.fill();ctx.strokeStyle='#d8dec477';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle=k?'#e0d5b7':'#c9b696';ctx.beginPath();ctx.arc(90,52,20,0,7);ctx.fill();ctx.fillStyle=k?'#50372e':'#352c24';
      if(k){ctx.fillRect(79,49,6,7);ctx.fillRect(95,49,6,7);ctx.fillStyle='#bfc4b6';ctx.fillRect(113,80,34,7);}else ctx.fillRect(71,33,38,11);
    }
    for(const b of $('color-swatches').children)b.setAttribute('aria-pressed',String(b.dataset.color===survivor));
  }
  function apply(value){account=value;onAccount(value);if(value){$('account-name').textContent=value.nickname+' · 내 계정';$('survivor-color').value=value.survivorColor;$('killer-color').value=value.killerColor;renderPreview();}sync();}
  function mode(value){register=value;for(const [id,active]of [['auth-login',!value],['auth-register',value]]){$(id).classList.toggle('selected',active);$(id).setAttribute('aria-pressed',String(active));}
    $('account-heading').textContent=value?'계정 만들기':'로그인';$('auth-submit').textContent=value?'계정 만들고 시작하기':'로그인';$('auth-password').autocomplete=value?'new-password':'current-password';$('auth-confirm-wrap').hidden=!value;$('auth-confirm').required=value;message('auth-message','');
  }
  $('auth-login').onclick=()=>mode(false);$('auth-register').onclick=()=>mode(true);
  $('password-toggle').onclick=()=>{const visible=$('auth-password').type==='password';$('auth-password').type=visible?'text':'password';$('password-toggle').textContent=visible?'숨기기':'표시';$('password-toggle').setAttribute('aria-label',visible?'비밀번호 숨기기':'비밀번호 표시');$('password-toggle').setAttribute('aria-pressed',String(visible));};
  $('auth-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    if(register&&$('auth-password').value!==$('auth-confirm').value){message('auth-message','비밀번호 확인이 일치하지 않습니다.',true);$('auth-confirm').focus();return;}
    busy=true;$('auth-submit').disabled=true;$('auth-submit').textContent='계정을 확인하는 중…';message('auth-message','');
    try{const data=await request('auth/'+(register?'register':'login'),{nickname:$('auth-nickname').value,password:$('auth-password').value});$('auth-password').value='';$('auth-confirm').value='';apply(data.account);socket.connect();$('entry-heading').focus({preventScroll:true});window.scrollTo(0,0);}
    catch(e){message('auth-message',e.message,true);}finally{busy=false;$('auth-submit').disabled=false;$('auth-submit').textContent=register?'계정 만들고 시작하기':'로그인';}
  };
  $('account-logout').onclick=async()=>{
    $('account-logout').disabled=true;
    try{await request('auth/logout',{});socket.disconnect();wardrobe=false;mode(false);apply(null);onLogout();message('auth-message','로그아웃했습니다.');}
    catch(e){message('color-message',e.message,true);message('auth-message',e.message,true);}finally{$('account-logout').disabled=false;}
  };
  $('wardrobe-open').onclick=()=>{wardrobe=true;sync();$('wardrobe-close').focus();};
  $('wardrobe-close').onclick=()=>{wardrobe=false;if(account){$('survivor-color').value=account.survivorColor;$('killer-color').value=account.killerColor;renderPreview();}sync();$('wardrobe-open').focus();};
  for(const id of ['survivor-color','killer-color'])$(id).oninput=()=>{renderPreview();message('color-message','미리보기 · 내 계정에 저장을 눌러 적용하세요.');};
  for(const [color,name]of [['#657f62','이끼'],['#9d5853','붉은 벽돌'],['#567f95','밤바다'],['#8e6f9e','안개 보라'],['#c09b53','황금빛'],['#b7bbac','은빛']]){
    const button=document.createElement('button'),swatch=document.createElement('i');button.type='button';button.dataset.color=color;button.setAttribute('aria-label','생존자 '+name);button.setAttribute('aria-pressed','false');swatch.style.backgroundColor=color;swatch.setAttribute('aria-hidden','true');button.append(swatch);button.onclick=()=>{$('survivor-color').value=color;renderPreview();message('color-message','미리보기 · 내 계정에 저장을 눌러 적용하세요.');};$('color-swatches').append(button);
  }
  $('color-reset').onclick=()=>{$('survivor-color').value=defaults.survivorColor;$('killer-color').value=defaults.killerColor;renderPreview();message('color-message','기본 색상 미리보기 · 저장하면 적용됩니다.');};
  $('color-save').onclick=()=>{
    if(!socket.connected){message('color-message','서버 연결을 확인한 뒤 다시 저장해주세요.',true);return;}
    $('color-save').disabled=true;message('color-message','내 계정에 저장하는 중…');
    socket.timeout(10000).emit('profile:set',{survivorColor:$('survivor-color').value,killerColor:$('killer-color').value},(err,r)=>{$('color-save').disabled=false;message('color-message',err?'저장 응답이 지연됩니다. 다시 확인해주세요.':r?.ok?'계정에 저장했습니다. 다음 로그인에도 유지됩니다.':r?.error||'저장에 실패했습니다.',!!err||!r?.ok);});
  };
  socket.on('account',apply);
  socket.on('connect_error',e=>{if(e.message==='로그인이 필요합니다.'){socket.disconnect();apply(null);onLogout();message('auth-message','로그인이 만료됐습니다. 다시 로그인해주세요.',true);}});
  async function init(){try{const response=await fetch('./api/me',{credentials:'same-origin',cache:'no-store'}),data=await response.json();if(response.ok&&data.account){apply(data.account);socket.connect();$('entry-heading').focus({preventScroll:true});window.scrollTo(0,0);}else message('auth-message',response.status===401?'':data.error||'계정을 확인할 수 없습니다.',response.status!==401);}catch{message('auth-message','서버 연결을 확인한 뒤 다시 시도해주세요.',true);}finally{$('auth-submit').disabled=false;sync();}}
  renderPreview();void init();return {sync,get account(){return account;}};
}
