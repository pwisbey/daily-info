/* 공통 UI: ☰ 내 설정 드로어(왼쪽) + 계정 드롭다운(오른쪽) + 프리셋 저장/동기화.
 *
 * 4페이지 공용. 메인(index)에서만 프리셋 클릭=즉시 실행 — index가 노출하는 훅 사용:
 *   window.__btGetForm()  → 현재 폼값(검증 포함, 실패 시 null)
 *   window.__btSetForm(p) → 폼 채우기 (async)
 *   window.__btRun()      → 백테스트 실행(쿠키 퍼널 → 결과 이동)
 *   window.__btReady      → 초기화 완료 Promise
 * 타 페이지에선 클릭 시 btpending 쿠키(부모도메인, 3분)로 담아 메인으로 이동 → 폼만 채움
 * (메인 경유 퍼널 유지 — 실행은 사용자가 버튼으로).
 *
 * 프리셋 저장소: localStorage('bt_presets') ↔ 로그인 시 서버(/api/presets) 동기화.
 * 첫 로그인 병합: 서버 기준 + 로컬에만 있는 이름 추가(최대 10개).
 */
(function(){
'use strict';
var MAXP=10;
var PROD = false;
var MAIN_URL=PROD?'https://infinite.smartdailyinfo.com/':'index.html';        // 운영은 파일명 미노출(_HOST_ROOT)
var RESULTS_URL=PROD?'https://btresult.smartdailyinfo.com/':'results.html';   // 로컬은 호스트 분기가 없어 파일명 유지
var MYSTATUS_URL=PROD?'https://mystatus.smartdailyinfo.com/':'results.html';  // '내상태' 결과 = 같은 results.html, 제목만 다른 도메인
var CD=PROD?';domain=.smartdailyinfo.com':'';
var IS_MAIN=!!document.getElementById('runBtn');

/* ---------- 유틸 ---------- */
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function api(path,opts){opts=opts||{};var h=Object.assign({'Content-Type':'application/json','X-BT':'1'},opts.headers||{});
  return fetch(path,Object.assign({},opts,{headers:h}));}
function el(tag,attrs,html){var e=document.createElement(tag);if(attrs)for(var k in attrs)e.setAttribute(k,attrs[k]);if(html!=null)e.innerHTML=html;return e;}
function fmtSub(p){var bits=[p.ticker];if(p.div!=null)bits.push((+p.div)+'분할');if(p.sell!=null)bits.push('목표'+(+p.sell)+'%');if(p.start)bits.push((p.mode==='live'?'기준 ':'')+p.start.slice(2));return bits.join(' · ');}
/* '내 상태로 시작' 프리셋 뱃지 (인라인 스타일 — style.css 캐시버스팅 없이 배포) */
function liveTag(p){return (p&&p.mode==='live')?' <span style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:6px;background:#ea580c;color:#fff;vertical-align:1px;text-shadow:.9px 0 0 #000,-.9px 0 0 #000,0 .9px 0 #000,0 -.9px 0 #000,.65px .65px 0 #000,-.65px .65px 0 #000,.65px -.65px 0 #000,-.65px -.65px 0 #000,.45px 0 0 #000,-.45px 0 0 #000">내상태</span>':'';}

/* ---------- 상태 (프리셋 = 로그인 전용, 서버가 유일한 저장소) ---------- */
var ME={login:false};
var PRESETS=[];
function pushServer(){if(!ME.login)return Promise.resolve();
  return api('/api/presets',{method:'PUT',body:JSON.stringify({presets:PRESETS})}).catch(function(){});}
function syncLoad(){
  return api('/api/me').then(function(r){return r.json();}).catch(function(){return{login:false};}).then(function(me){
    ME=me&&me.login?me:{login:false};
    try{localStorage.setItem('bt_login',ME.login?'1':'0');}catch(e){}   // 첫 페인트용 힌트
    if(!ME.login){PRESETS=[];renderAll();return;}
    return api('/api/presets').then(function(r){return r.json();}).then(function(j){
      PRESETS=j.presets||[];
    }).catch(function(){PRESETS=[];}).then(renderAll);
  });
}

/* ---------- 헤더 버튼 ---------- */
var hdr=document.querySelector('.pagehdr');if(!hdr)return;
var themeBtn=document.getElementById('themeBtn');
var menuBtn=el('button',{type:'button',class:'menubtn','aria-label':'내 설정 열기',title:'내 설정'},'☰');
hdr.insertBefore(menuBtn,hdr.firstChild);
var acctBtn=el('button',{type:'button',class:'acctbtn'},'로그인');
hdr.insertBefore(acctBtn,themeBtn);

/* ---------- 드로어 ---------- */
var dim=el('div',{class:'btdim',hidden:''});
var dr=el('aside',{class:'btdrawer','aria-label':'내 설정'});
/* 닫기(‹)는 **왼쪽 끝** — 드로어가 왼쪽에서 나오니 되돌리는 방향과 같다(개인용 사이트와 동일, 2026-09-05). */
dr.innerHTML='<div class="bthd">'
  +  '<button type="button" class="btx" aria-label="닫기">'
  +    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>'
  +  '<b>내 설정</b></div>'
  +'<div class="btacct-m"></div>'
  +'<div class="btlist"></div>'
  +(IS_MAIN?''                                              // 저장은 메인의 "이 설정값 저장" 버튼으로 (실행 아래)
           :'<a class="btsave btgomain" href="'+MAIN_URL+'">설정 페이지로 가기</a>')
  +'<div class="btsync"></div>'
  +'<div class="btfoot"><a href="privacy.html">개인정보처리방침</a></div>';
document.body.appendChild(dim);document.body.appendChild(dr);
/* 요약줄(#summary) 오른쪽 '설정 저장' — 폼 없는 페이지(결과 등)의 저장 경로. 메인의 saveBtn과 같은 saveCurrent().
   텍스트는 안쪽 span이 담당하므로 재렌더(재계산 포함)에도 이 버튼은 살아남는다.
   라벨의 \n은 PC에선 .gobtn의 nowrap이 공백으로 접어 한 줄, 모바일 미디어쿼리에선 pre-line으로 두 줄. */
var sumBar=document.getElementById('summary'), sumSaveBtn=null;
if(!IS_MAIN&&window.__btGetForm&&sumBar&&sumBar.querySelector('span')){
  sumSaveBtn=el('button',{type:'button',class:'gobtn sumsave',title:'이 설정을 내 설정으로 저장'},'설정\n저장');
  sumSaveBtn.style.display='none';
  sumSaveBtn.onclick=saveCurrent;
  sumBar.appendChild(sumSaveBtn);
}
function drawerOpen(){dim.hidden=false;dr.classList.add('open');}
function drawerClose(){dim.hidden=true;dr.classList.remove('open');}
menuBtn.onclick=drawerOpen;
dim.onclick=drawerClose;
dr.querySelector('.btx').onclick=drawerClose;
document.addEventListener('keydown',function(e){if(e.key==='Escape'){drawerClose();popClose();modalClose();}});

/* ---------- 모달 ---------- */
var modalRoot=null;
function modalClose(){if(modalRoot){modalRoot.remove();modalRoot=null;}}
function modal(html){modalClose();
  modalRoot=el('div',{class:'btmdim'});
  var box=el('div',{class:'btmodal'},html);
  modalRoot.appendChild(box);
  modalRoot.addEventListener('mousedown',function(e){if(e.target===modalRoot)modalClose();});
  document.body.appendChild(modalRoot);
  return box;}

/* ---------- 계정 드롭다운 ---------- */
var pop=el('div',{class:'btpop',hidden:''});hdr.appendChild(pop);
function popClose(){pop.hidden=true;}
function popOpen(){renderPop();pop.hidden=false;}
acctBtn.onclick=function(e){e.stopPropagation();pop.hidden?popOpen():popClose();};
document.addEventListener('mousedown',function(e){if(!pop.contains(e.target)&&e.target!==acctBtn)popClose();});

function acctItems(){
  var it=[];
  if(!ME.login){
    it.push({label:'구글로 로그인',fn:googleLogin});
    it.push({label:'코드로 로그인',fn:codeLoginModal});
    it.push({label:'새 코드 만들기 (가입 없이)',fn:codeNew});
  }else{
    it.push({label:(ME.google?'구글 계정':'코드 계정')+' · 동기화 중 ✓',cls:'stat'});
    it.push({label:ME.hasCode?'동기화 코드 재발급':'동기화 코드 발급',fn:codeRotate});
    it.push({label:'로그아웃',fn:doLogout});
    it.push({label:'계정삭제',fn:doDelete,cls:'danger'});
  }
  return it;   // 개인정보처리방침 링크는 드로어 하단(.btfoot) 한 곳만
}
function renderItems(box,rows){
  box.innerHTML='';
  rows.forEach(function(o){
    var b;
    if(o.href){b=el('a',{class:'btpi '+(o.cls||''),href:o.href},esc(o.label));}
    else if(!o.fn){b=el('div',{class:'btpi '+(o.cls||'')},esc(o.label));}
    else{b=el('button',{type:'button',class:'btpi '+(o.cls||'')},esc(o.label));
      b.onclick=function(){popClose();o.fn();};}
    box.appendChild(b);
  });
}
function renderPop(){renderItems(pop,acctItems());}

/* ---------- 렌더 ---------- */
function renderAll(){
  // 왼쪽 버튼: 로그아웃='로그인' 텍스트 / 로그인=☰ (드로어). 오른쪽 👤✓는 로그인 때만.
  menuBtn.textContent=ME.login?'☰':'로그인';
  menuBtn.title=ME.login?'내 설정':'로그인';
  menuBtn.classList.toggle('menubtn-txt',!ME.login);
  acctBtn.style.display=ME.login?'':'none';
  acctBtn.textContent='👤✓';
  acctBtn.title='계정';
  dr.classList.toggle('showacct',!ME.login);     // 로그아웃: 드로어 상단에 로그인 메뉴 상시 표시
  if(!pop.hidden)renderPop();
  renderItems(dr.querySelector('.btacct-m'),acctItems());
  if(IS_MAIN){
    var rm=document.getElementById('pRemember');   // 로그인 중엔 "내 설정값 기억" 체크 숨김 (프리셋이 대체)
    if(rm&&rm.closest('label'))rm.closest('label').style.display=ME.login?'none':'';
    var sb=document.getElementById('saveBtn');     // "설정값 저장" 버튼 = 로그인 상태에서만
    if(sb)sb.hidden=!ME.login;
  }
  if(sumSaveBtn)sumSaveBtn.style.display=ME.login?'':'none';   // 프리셋은 로그인 전용 → 로그아웃 시 숨김
  var sync=dr.querySelector('.btsync');
  sync.style.display=ME.login?'':'none';
  sync.innerHTML=ME.login?'동기화 중 ✓ <span class="btcnt">'+PRESETS.length+'/'+MAXP+'</span>':'';
  var list=dr.querySelector('.btlist');
  if(!ME.login){list.innerHTML='<div class="btempty">로그인하면 설정값을 저장하고<br>기기 간 동기화할 수 있어요.</div>';return;}
  if(!PRESETS.length){list.innerHTML='<div class="btempty">저장된 설정이 없습니다.'+(IS_MAIN?'<br>백테스트 실행 버튼 아래<br>"설정값 저장"으로 추가하세요.':(sumSaveBtn?'<br>요약줄 오른쪽 "설정 저장"으로<br>지금 설정을 추가하세요.':'<br>설정 페이지에서 저장할 수 있어요.'))+'</div>';return;}
  list.innerHTML='';
  PRESETS.forEach(function(p,i){
    var row=el('div',{class:'btitem'});
    var main=el('button',{type:'button',class:'btrun',title:'이 설정으로 바로 실행'},
      '<b>'+esc(p.name)+liveTag(p.params)+'</b><small>'+esc(fmtSub(p.params||{}))+'</small>');
    main.onclick=function(){applyPreset(p);};
    // ⋯ → 연필(수정) 아이콘 (사용자 지정 2026-09-03). 인라인 SVG이라 style.css를 안 건드린다 → ?v= 캐시버스팅 불필요.
    //   stroke=currentColor 라 .btmore 의 글자색·hover색(var(--muted)→var(--ink))을 그대로 따라간다.
    var more=el('button',{type:'button',class:'btmore','aria-label':'관리'},
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;margin:auto">'
      +'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>');
    more.onclick=function(e){e.stopPropagation();presetMenu(p,i);};
    row.appendChild(main);row.appendChild(more);list.appendChild(row);
  });
}

/* ---------- 프리셋 동작 ---------- */
function applyPreset(p){
  // '내상태' 프리셋은 live 폼이 있는 페이지(__btLive)에서만 폼 채우기 — index는 결과 직행
  var live=p.params&&p.params.mode==='live';
  if(IS_MAIN&&window.__btSetForm&&(!live||window.__btLive)){
    drawerClose();
    Promise.resolve(window.__btReady).then(function(){return window.__btSetForm(p.params||{});})
      .then(function(){if(window.__btRun)window.__btRun();});
  }else{
    // 결과·매매표·세금 페이지에서도 클릭 즉시 결과 — btp 쿠키(설정 퍼널) 갱신 후 결과로 직행
    document.cookie='btp='+encodeURIComponent(JSON.stringify(p.params||{}))+CD+';path=/;max-age=31536000;samesite=lax';
    location.href=live?MYSTATUS_URL:RESULTS_URL;   // 내상태 프리셋은 '내 상태 결과' 도메인으로
  }
}
function nameModal(title,init,onOk){
  var box=modal('<h3>'+esc(title)+'</h3><input class="btin" maxlength="40" value="'+esc(init)+'">'
    +'<div class="btmrow"><button type="button" class="btmbtn ghost">취소</button><button type="button" class="btmbtn">저장</button></div>');
  var inp=box.querySelector('.btin');inp.focus();inp.select();
  box.querySelector('.ghost').onclick=modalClose;
  var ok=function(){var v=inp.value.trim();if(!v){inp.focus();return;}modalClose();onOk(v);};
  box.querySelector('.btmbtn:not(.ghost)').onclick=ok;
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')ok();});
}
function saveCurrent(){
  if(!ME.login){alert('로그인이 필요합니다.');return;}
  if(!window.__btGetForm)return;
  var p=window.__btGetForm();if(!p)return;               // 필수값 alert는 index쪽에서
  var def=(p.mode==='live'?'내상태 ':'')+(p.ticker||'')+' '+(p.div||'')+'분할 '+(p.sell||'')+'%';   // 두 모드 프리셋 이름 구분
  nameModal('설정 이름',def,function(name){
    var i=PRESETS.findIndex(function(x){return x.name===name;});
    if(i>=0){if(!confirm('"'+name+'" 이름이 이미 있습니다. 덮어쓸까요?'))return;PRESETS[i]={name:name,params:p};}
    else{
      if(PRESETS.length>=MAXP){alert('프리셋은 최대 '+MAXP+'개까지 저장할 수 있어요. 기존 항목을 삭제해 주세요.');return;}
      PRESETS.push({name:name,params:p});
    }
    pushServer().then(renderAll);
  });
}
/* ---------- 프리셋 순서 바꾸기 (PC=드래그 · 모바일=길게 눌러 이동) ----------
   .btlist는 renderAll이 innerHTML로 갈아끼워도 컨테이너 자체는 남으므로 여기 한 번만 위임한다.
   보라색 선(.btdrop)= 놓이는 자리. 터치는 400ms 길게 누른 뒤부터 이동 —
   그 전에 손가락이 움직이면 드래그를 포기하고 목록 스크롤을 살린다. */
(function(){
  var LIST=dr.querySelector('.btlist'), LP=400, TOL=8, MOUSE_TOL=4;
  var s=null;
  function items(){return [].slice.call(LIST.querySelectorAll('.btitem'));}
  function noScroll(e){e.preventDefault();}        // 드래그 중 페이지·목록 스크롤 차단(비-passive 필수)
  function place(clientY){
    var y=clientY-LIST.getBoundingClientRect().top+LIST.scrollTop, list=items(), to=list.length;
    for(var i=0;i<list.length;i++){ var it=list[i];
      if(y<it.offsetTop+it.offsetHeight/2){to=i;break;} }
    s.to=to;
    var ref=list[to];
    s.line.style.top=(ref?ref.offsetTop-4:LIST.scrollHeight-2)+'px';
  }
  function begin(){
    s.on=true; s.item.classList.add('btdrag');
    s.line=el('div',{class:'btdrop'}); LIST.appendChild(s.line);
    document.addEventListener('touchmove',noScroll,{passive:false});
    place(s.lastY);
  }
  function finish(){
    if(!s)return;
    var st=s; s=null;
    clearTimeout(st.timer);
    if(!st.on)return;
    document.removeEventListener('touchmove',noScroll,{passive:false});
    st.item.style.transform=''; st.item.classList.remove('btdrag');
    if(st.line&&st.line.parentNode)st.line.parentNode.removeChild(st.line);
    if(st.moved){   // 드래그로 끝난 탭이 프리셋 실행으로 이어지지 않게 다음 click 1회 삼킴
      var blk=function(ev){ev.stopPropagation();ev.preventDefault();document.removeEventListener('click',blk,true);};
      document.addEventListener('click',blk,true);
      setTimeout(function(){document.removeEventListener('click',blk,true);},400);
    }
    var to=st.to; if(to>st.from)to--;
    if(st.moved&&to!==st.from&&st.from>=0){
      var p=PRESETS.splice(st.from,1)[0]; PRESETS.splice(to,0,p);
      pushServer().then(renderAll);
    }
  }
  LIST.addEventListener('pointerdown',function(e){
    if(!ME.login||PRESETS.length<2)return;                  // 1개면 옮길 데가 없다
    if(e.button!=null&&e.button!==0)return;
    var item=e.target.closest?e.target.closest('.btitem'):null;
    if(!item||e.target.closest('.btmore'))return;           // 연필(관리) 버튼은 제외 — SVG 안을 눌러도 closest가 버튼을 찾는다
    var list=items(), i=list.indexOf(item);
    s={item:item,from:i,to:i,y0:e.clientY,lastY:e.clientY,id:e.pointerId,
       touch:e.pointerType==='touch',on:false,moved:false,timer:null};
    if(s.touch)s.timer=setTimeout(begin,LP);                // 마우스는 아래 move에서 4px 넘으면 시작
  });
  document.addEventListener('pointermove',function(e){
    if(!s||e.pointerId!==s.id)return;
    s.lastY=e.clientY;
    var dy=e.clientY-s.y0;
    if(!s.on){
      if(s.touch){ if(Math.abs(dy)>TOL){clearTimeout(s.timer);s=null;} return; }   // 스크롤 우선
      if(Math.abs(dy)<MOUSE_TOL)return;
      begin();
    }
    s.moved=true;
    s.item.style.transform='translateY('+dy+'px)';
    place(e.clientY);
  });
  document.addEventListener('pointerup',finish);
  document.addEventListener('pointercancel',finish);
})();

if(IS_MAIN){var sb=document.getElementById('saveBtn');if(sb)sb.onclick=saveCurrent;}   // 실행 버튼 아래 "이 설정값 저장"
function presetMenu(p,i){
  var box=modal('<h3>'+esc(p.name)+'</h3><div class="btmcol">'
    +'<button type="button" class="btmi" data-a="rename">이름 변경</button>'
    +(i>0?'<button type="button" class="btmi" data-a="up">위로 이동</button>':'')
    +'<button type="button" class="btmi danger" data-a="del">삭제</button>'
    +'<button type="button" class="btmi ghost" data-a="x">닫기</button></div>');
  box.addEventListener('click',function(e){
    var a=e.target&&e.target.dataset&&e.target.dataset.a;if(!a)return;
    if(a==='x'){modalClose();return;}
    if(a==='rename'){modalClose();nameModal('이름 변경',p.name,function(name){
      if(name!==p.name&&PRESETS.some(function(x){return x.name===name;})){alert('같은 이름이 이미 있습니다.');return;}
      p.name=name;pushServer().then(renderAll);});return;}
    if(a==='up'){PRESETS.splice(i,1);PRESETS.splice(i-1,0,p);modalClose();pushServer().then(renderAll);return;}
    if(a==='del'){if(!confirm('"'+p.name+'" 프리셋을 삭제할까요?'))return;
      PRESETS.splice(i,1);modalClose();pushServer().then(renderAll);return;}
  });
}

/* ---------- 로그인 동작 ---------- */
function googleLogin(){
  fetch('/api/auth/google/start',{redirect:'manual'}).then(function(r){
    if(r.status===503)return r.json().then(function(j){alert(j.detail||'구글 로그인은 아직 준비 중입니다.');});
    location.href='/api/auth/google/start?next='+encodeURIComponent(location.href);
  }).catch(function(){location.href='/api/auth/google/start?next='+encodeURIComponent(location.href);});
}
function codeShowModal(code,title){
  var box=modal('<h3>'+esc(title||'내 동기화 코드')+'</h3>'
    +'<div class="btcode">'+esc(code)+'</div>'
    +'<div class="btwarn">이 코드는 <b>지금 한 번만</b> 표시됩니다.<br>다른 기기에서 "코드로 로그인"에 입력하면 같은 계정으로 로그인됩니다.<br>분실 시 복구할 수 없으니 꼭 보관해 주세요. (재발급하면 이전 코드는 무효)</div>'
    +'<div class="btmrow"><button type="button" class="btmbtn ghost">닫기</button><button type="button" class="btmbtn">복사</button></div>');
  box.querySelector('.ghost').onclick=modalClose;
  box.querySelector('.btmbtn:not(.ghost)').onclick=function(){
    var done=function(){var b=box.querySelector('.btmbtn:not(.ghost)');b.textContent='복사됨 ✓';};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(code).then(done,function(){fallback();done();});
    else{fallback();done();}
    function fallback(){var t=document.createElement('textarea');t.value=code;document.body.appendChild(t);t.select();try{document.execCommand('copy');}catch(e){}t.remove();}
  };
}
function codeNew(){
  api('/api/auth/code/new',{method:'POST'}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){
      if(!x.ok){alert(x.j.detail||'실패했습니다.');return;}
      codeShowModal(x.j.code,'가입 완료 — 내 동기화 코드');
      syncLoad();
    }).catch(function(){alert('네트워크 오류');});
}
function codeLoginModal(){
  var box=modal('<h3>코드로 로그인</h3><input class="btin btin-code" placeholder="BT-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off">'
    +'<div class="btmrow"><button type="button" class="btmbtn ghost">취소</button><button type="button" class="btmbtn">로그인</button></div>'
    +'<button type="button" class="btlink btnewcode">코드가 없나요? 새 코드 만들기</button>');
  var inp=box.querySelector('.btin');inp.focus();
  box.querySelector('.ghost').onclick=modalClose;
  box.querySelector('.btnewcode').onclick=function(){modalClose();codeNew();};
  var ok=function(){
    var v=inp.value.trim();if(!v){inp.focus();return;}
    api('/api/auth/code/login',{method:'POST',body:JSON.stringify({code:v})})
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
      .then(function(x){
        if(!x.ok){alert(x.j.detail||'코드가 올바르지 않습니다.');inp.focus();return;}
        modalClose();syncLoad();
      }).catch(function(){alert('네트워크 오류');});
  };
  box.querySelector('.btmbtn:not(.ghost)').onclick=ok;
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')ok();});
}
function codeRotate(){
  if(ME.hasCode&&!confirm('재발급하면 이전 코드는 즉시 무효가 됩니다. 계속할까요?'))return;
  api('/api/auth/code/rotate',{method:'POST'}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(x){
      if(!x.ok){alert(x.j.detail||'실패했습니다.');return;}
      codeShowModal(x.j.code);syncLoad();
    }).catch(function(){alert('네트워크 오류');});
}
function doLogout(){
  api('/api/auth/logout',{method:'POST'}).then(function(){syncLoad();});   // 프리셋은 서버 전용 — 로그아웃=목록 사라짐
}
function doDelete(){
  var box=modal('<h3>계정삭제</h3><div class="btwarn">계정과 저장된 프리셋이 <b>즉시 삭제</b>되며 복구할 수 없습니다.</div>'
    +'<div class="btmrow"><button type="button" class="btmbtn ghost">취소</button><button type="button" class="btmbtn danger">삭제</button></div>');
  box.querySelector('.ghost').onclick=modalClose;
  box.querySelector('.danger').onclick=function(){
    api('/api/auth/account',{method:'DELETE'}).then(function(r){
      modalClose();
      if(!r.ok)alert('실패했습니다.');
      syncLoad();
    });
  };
}

try{ME={login:localStorage.getItem('bt_login')==='1'};}catch(e){}   // 마지막 상태로 즉시 페인트(깜빡임 방지)
try{localStorage.removeItem('bt_presets');}catch(e){}               // 구버전 로컬 프리셋 잔재 정리
renderAll();
syncLoad();
})();
