/* 차트 컴포넌트 — 결과 페이지 · 설정 비교 페이지 공용.
   2026-08-01 results.html에서 그대로 분리(로직 무변경) — 두 페이지가 같은 조작감을 쓰기 위함.
   쓰는 법: initChart(prefix,{baseline,fmt,fmtAxis,log})
           → {setData(dates, [{name,color,values,width?}]), bindToggle(el, name)}
   log:true 면 오른쪽 아래 툴바에 [로그] 토글이 붙는다 (자산곡선 전용 — MDD는 음수라 못 쓴다).
   bindToggle: 페이지가 만든 버튼(예: 패널 제목 줄의 .h2tog)을 그 곡선의 켜기/끄기 스위치로 (2026-08-02).
   필요한 DOM 5개: <prefix>Canvas · <prefix>Chart(svg) · <prefix>Hit · <prefix>Readout · <prefix>Zoom
   필요한 CSS: style.css의 .chartbox/.cgrid/.caxis/.cbase/.ccross/.dot-label/.chart-zoom-btn 계열 */
(function(){
const $=id=>document.getElementById(id);
const yymmdd=s=>{ if(!s)return ''; const p=String(s).split('-'); return p.length<3?s:p[0].slice(2)+'/'+p[1]+'/'+p[2]; };
/* ---------- 차트 — stock_chart 종목상세/비교 페이지 조작감 이식 ----------
   · 크로스헤어: 마우스=커서 따라 / 터치=탭으로 소환 후 '잡아서 밀기'(상대 드래그, 점프 없음) / 손 떼도 유지
   · 확대: 휠(커서 중심) · 두손가락 핀치(크로스헤어 고정 + 중점 이동=팬) · ＋/− 버튼(크로스헤어 중심) · ⤢ 전체
   · 확대 시 보이는 구간만으로 y범위 재산정(납작해짐 방지), 플롯 영역 clip, 축 라벨 재계산
   · 값 라벨: 선 꼭짓점을 가장 적게 덮는 자리(크로스헤어 좌/우 → 네 모서리)에 스택 배치(선 가림 방지)
   · 날짜는 차트 위 고정 리드아웃 줄에 — 떠다니는 박스가 선을 가리지 않게 */
const PADC={top:12,right:54,bottom:20,left:8};
function yLvls(min,max,n){
  const span=max-min||1, raw=span/n, mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>span/s<=n)||10*mag;
  const out=[]; for(let v=Math.ceil(min/step)*step; v<=max+1e-9; v+=step) out.push(v);
  return out;
}
/* 로그축 눈금 — 1·2·5 ×10ⁿ 만 쓴다(100%·200%·500%·1000%…). 구간이 좁아 3개도 안 나오면
   1·1.5·2·3·5·7 로 촘촘히. lo/hi는 log10 값. */
function logLvls(lo,hi){
  for(const ms of [[1,2,5],[1,1.5,2,3,5,7],[1,1.2,1.5,2,2.5,3,4,5,6,8]]){
    const out=[];
    for(let k=Math.floor(lo)-1;k<=Math.ceil(hi)+1;k++)
      for(const m of ms){const v=m*Math.pow(10,k), t=Math.log10(v);
        if(t>=lo-1e-9&&t<=hi+1e-9)out.push(v);}
    if(out.length>=3)return out.slice(0,9);
  }
  return [];
}
function initChart(prefix,opts){
  const canvas=$(prefix+'Canvas'), svg=$(prefix+'Chart'), hit=$(prefix+'Hit'),
        readout=$(prefix+'Readout'), zoomBox=$(prefix+'Zoom');
  const st={dates:[],series:[],zoom:[0,1],hover:null,W:0,H:0,geom:null,labels:[],log:false,hidden:new Set()};
  /* 꺼둔 곡선(hidden)은 그리기·y범위·크로스헤어 어디에서도 빠진다 — 그래서 남은 곡선들로 세로축이
     다시 잡힌다(주가처럼 등락폭이 큰 선을 끄면 나머지가 납작해지지 않는다). 2026-08-02 */
  const shown=()=>st.series.filter(s=>!st.hidden.has(s.name));
  /* 툴바는 오른쪽 정렬이라 **맨 오른쪽 버튼만 자리가 고정**된다(왼쪽에 ⤢전체가 나타나면 그 오른쪽
     것들은 그대로, 왼쪽 것들이 밀린다). 로그 토글은 반복해서 누르는 버튼이라 **맨 오른쪽**에 둔다
     — 사용자 지정 2026-08-01(＋/−가 대신 밀리는 건 감수). 상태는 저장하지 않는다(열면 늘 선형). */
  zoomBox.innerHTML='<button type="button" class="chart-zoom-btn chart-zoom-reset" style="display:none">⤢ 전체</button>'
    +'<button type="button" class="chart-zoom-btn" aria-label="확대">＋</button>'
    +'<button type="button" class="chart-zoom-btn" aria-label="축소">−</button>'
    +(opts.log?'<button type="button" class="chart-zoom-btn chart-log-btn" aria-pressed="false"'
      +' title="세로축을 로그(배수) 눈금으로 — 같은 높이 = 같은 비율 변화. 긴 기간에서 초반 구간이 바닥에 눌리는 걸 푼다">로그</button>':'');
  const btnLog=zoomBox.querySelector('.chart-log-btn');
  const [btnReset,btnIn,btnOut]=zoomBox.querySelectorAll('button');
  btnIn.onclick=()=>zoomCenter(0.8); btnOut.onclick=()=>zoomCenter(1.25);
  btnReset.onclick=()=>{st.zoom=[0,1];render();};
  if(btnLog) btnLog.onclick=()=>{
    st.log=!st.log;
    btnLog.classList.toggle('on',st.log);
    btnLog.setAttribute('aria-pressed',String(st.log));
    render();
  };
  const tr=v=>st.log?Math.log10(v):v;                 // 값 → 축 좌표계
  const okv=v=>v!=null&&!Number.isNaN(v)&&(!st.log||v>0);   // 로그축에선 0 이하를 못 그린다(끊어서 표시)

  function computeGeom(){
    const N=st.dates.length;
    if(!st.W||!st.H||N===0) return null;
    const [w0,w1]=st.zoom, wspan=w1-w0||1;
    const plotW=st.W-PADC.left-PADC.right, plotH=st.H-PADC.top-PADC.bottom;
    const fracAt=i=>N<=1?0.5:i/(N-1);
    const inView=i=>{const f=fracAt(i);return f>=w0-1e-9&&f<=w1+1e-9;};
    let min=Infinity,max=-Infinity;
    const scan=fv=>{for(const s of shown())for(let i=0;i<s.values.length;i++){const v=s.values[i];
      if(!okv(v))continue; if(fv&&!inView(i))continue; const t=tr(v); if(t<min)min=t; if(t>max)max=t;}};
    scan(true);                                   // 보이는 구간만으로 y범위 (확대 시 세로도 꽉 차게)
    if(!isFinite(min)||!isFinite(max)){min=Infinity;max=-Infinity;scan(false);}
    if(!isFinite(min)||!isFinite(max)) return null;
    const span=max-min||Math.abs(max)||1, padY=span*0.08;
    const dMin=min-padY, dMax=max+padY;            // ← 로그축이면 log10 좌표계
    const zoomX=px=>PADC.left+(px-PADC.left-w0*plotW)/wspan;
    const invX=px=>PADC.left+w0*plotW+(px-PADC.left)*wspan;
    const xAt=i=>zoomX(PADC.left+(N<=1?plotW/2:fracAt(i)*plotW));
    const yAt=v=>PADC.top+(1-(tr(v)-dMin)/(dMax-dMin))*plotH;
    const minSpan=Math.min(1,Math.max(3/Math.max(N-1,1),0.02));   // 최대 확대: 최소 3점 또는 전체 2%
    return {N,plotW,plotH,xAt,yAt,invX,dMin,dMax,minSpan,yBottom:PADC.top+plotH};
  }
  function pathOf(vals,g){
    let d='',pen=false;
    for(let i=0;i<vals.length;i++){const v=vals[i];
      if(!okv(v)){pen=false;continue;}
      d+=(pen?'L':'M')+g.xAt(i).toFixed(2)+' '+g.yAt(v).toFixed(2)+' '; pen=true;}
    return d.trim();
  }
  function xTicksV(g){   // 보이는 구간에 고르게 5개 날짜 라벨 (확대 정도에 따라 표기 축약)
    const [w0,w1]=st.zoom, visN=Math.max(1,Math.round((w1-w0)*(g.N-1)));
    const fmt=s=>{const p=String(s||'').split('-'); if(p.length<3)return String(s||'');
      return visN>500?p[0].slice(2)+'/'+p[1] : visN>40?p[0].slice(2)+'/'+p[1]+'/'+p[2] : p[1]+'/'+p[2];};
    const out=[], seen=new Set();
    for(let k=0;k<5;k++){
      const f=w0+(k+0.5)/5*(w1-w0);
      let i=Math.round(f*(g.N-1)); i=Math.max(0,Math.min(g.N-1,i));
      const lb=fmt(st.dates[i]); if(seen.has(lb))continue; seen.add(lb);
      out.push({x:g.xAt(i),label:lb});
    }
    return out;
  }
  function render(){
    st.geom=computeGeom(); const g=st.geom;
    btnReset.style.display=(st.zoom[0]>1e-4||st.zoom[1]<0.9999)?'':'none';
    hit.classList.toggle('pannable',st.zoom[1]-st.zoom[0]<0.9999);   // 확대 상태에서만 손 커서 (끌 수 있다는 표시)
    if(!g){svg.innerHTML='';updateCross();return;}
    svg.setAttribute('width',st.W); svg.setAttribute('height',st.H);
    const cid=prefix+'Clip';
    let s=`<defs><clipPath id="${cid}"><rect x="${PADC.left}" y="${PADC.top}" width="${g.plotW}" height="${g.plotH}"/></clipPath></defs>`;
    for(const v of (st.log?logLvls(g.dMin,g.dMax):yLvls(g.dMin,g.dMax,5))){const y=g.yAt(v);
      s+=`<line class="cgrid" x1="${PADC.left}" y1="${y}" x2="${st.W-PADC.right}" y2="${y}"/>`
        +`<text class="caxis" x="${st.W-PADC.right+6}" y="${y+3.5}">${opts.fmtAxis(v)}</text>`;}
    if(opts.baseline!=null&&okv(opts.baseline)&&tr(opts.baseline)>=g.dMin&&tr(opts.baseline)<=g.dMax){
      const yb=g.yAt(opts.baseline);
      s+=`<line class="cbase" x1="${PADC.left}" y1="${yb}" x2="${st.W-PADC.right}" y2="${yb}"/>`;}
    for(const t of xTicksV(g)){
      if(t.x<PADC.left-0.5||t.x>st.W-PADC.right+0.5)continue;   // 확대로 밖에 나간 라벨 숨김
      s+=`<text class="caxis" x="${t.x}" y="${st.H-5}" text-anchor="middle">${t.label}</text>`;}
    s+=`<g clip-path="url(#${cid})">`;
    for(const sr of shown())
      s+=`<path d="${pathOf(sr.values,g)}" fill="none" stroke="${sr.color}" stroke-width="${sr.width||1.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
    s+=`<g class="crossg"></g></g>`;
    svg.innerHTML=s;
    updateCross();
  }
  function updateCross(){
    st.labels.forEach(el=>el.remove()); st.labels=[];
    const g=st.geom, cg=svg.querySelector('.crossg');
    if(!g||st.hover==null||st.hover>=g.N){ if(cg)cg.innerHTML=''; readout.innerHTML='&nbsp;'; return; }
    const i=st.hover, x=g.xAt(i);
    let s=`<line class="ccross" x1="${x}" y1="${PADC.top}" x2="${x}" y2="${g.yBottom}"/>`;
    const items=[];
    for(const sr of shown()){const v=sr.values[i];
      if(!okv(v))continue;
      const y=g.yAt(v);
      s+=`<circle cx="${x}" cy="${y}" r="9" fill="${sr.color}" opacity="0.2"/>`
        +`<circle cx="${x}" cy="${y}" r="4.5" fill="${sr.color}" stroke="#fff" stroke-width="2"/>`;
      items.push({name:sr.name,color:sr.color,y,text:opts.fmt(v)});}
    cg.innerHTML=s;
    readout.textContent=yymmdd(st.dates[i]);
    placeLabels(items,Math.max(PADC.left,Math.min(st.W-PADC.right,x)));
  }
  function placeLabels(items,xc){   // 선을 가장 적게 덮는 자리에 값 라벨 스택 배치
    const g=st.geom; if(!items.length)return;
    const GAP=26, LH=20;
    const wOf=d=>d.name.length*12+String(d.text).length*7.5+34;
    const Wmax=Math.max(...items.map(wOf));
    const Hg=(items.length-1)*GAP+LH;
    const pts=[], step=Math.max(1,Math.floor(g.N/600));   // 가림 판정용 표본(성능 위해 최대 ~600점/선)
    for(const sr of shown())for(let i=0;i<sr.values.length;i+=step){
      const v=sr.values[i]; if(!okv(v))continue;
      const px=g.xAt(i); if(px<PADC.left-2||px>st.W-PADC.right+2)continue;
      pts.push([px,g.yAt(v)]);}
    const order=items.map((d,i)=>({i,y:d.y})).sort((a,b)=>a.y-b.y);
    const coverAt=(x0,y0)=>{let n=0;
      for(let k=0;k<order.length;k++){
        const yl=y0+k*GAP-2, yh=y0+k*GAP+LH-2;
        for(let p=0;p<pts.length;p++){
          const px=pts[p][0]; if(px<x0||px>x0+Wmax)continue;
          const py=pts[p][1]; if(py>=yl&&py<=yh)n++;}}
      return n;};
    // 박스는 항상 크로스헤어 좌/우에 붙어 마우스를 따라다닌다(모서리 고정 없음).
    // 세로 위치(점 중심/위/아래)와 좌/우만 골라 선을 가장 적게 가리는 곳에. 좌우 14px 간격이라 크로스헤어 선·점은 안 덮음.
    const meanY=items.reduce((s,d)=>s+d.y,0)/items.length;
    const clampY=y=>Math.max(PADC.top+4,Math.min(g.yBottom-Hg-4,y));
    const midY=clampY(meanY-Hg/2), topY=PADC.top+4, botY=Math.max(PADC.top+4,g.yBottom-Hg-4);
    const rx=xc+14, lx=xc-14-Wmax;
    const cands=[[rx,midY,0],[lx,midY,0.5],[rx,topY,1],[lx,topY,1.5],[rx,botY,2],[lx,botY,2.5]]
      .filter(c=>c[0]>=PADC.left-1&&c[0]+Wmax<=st.W-PADC.right+2);
    let best=null;
    for(const c of cands){const n=coverAt(c[0],c[1])+c[2];
      if(best==null||n<best.n)best={x:c[0],y:c[1],n};
      if(n===0)break;}
    // 좌우 어느 쪽에도 박스 폭이 안 남는 경우(모바일에서 크로스헤어가 가운데면 흔하다) —
    // 예전엔 그냥 크로스헤어 옆에 밀어넣어 선 위에 얹혔다. 이제 네 모서리 중 가장 빈 곳에 둔다.
    // (2026-08-01. 좁은 화면에서 값 박스가 곡선을 가린다는 지적 — 원인은 글자 길이가 아니라 이 폴백이었다)
    if(!best){
      const cx0=PADC.left+2, cx1=Math.max(cx0, st.W-PADC.right-Wmax-2);
      for(const c of [[cx0,topY],[cx1,topY],[cx0,botY],[cx1,botY]]){
        const n=coverAt(c[0],c[1]);
        if(best==null||n<best.n)best={x:c[0],y:c[1],n};
        if(n===0)break;
      }
    }
    order.forEach((o,k)=>{const d=items[o.i];
      const el=document.createElement('div');
      el.className='dot-label';
      el.style.left=best.x+'px'; el.style.top=(best.y+k*GAP)+'px';
      el.innerHTML=`<span class="dot-label-dot" style="background:${d.color}"></span><span class="dot-label-name">${d.name}</span><b style="color:${d.color}">${d.text}</b>`;
      canvas.appendChild(el); st.labels.push(el);});
  }
  function setHoverAtX(x){
    const g=st.geom; if(!g)return;
    const xf=g.invX(x);   // 확대된 화면 x → 전체 도메인 x
    let idx=Math.round((xf-PADC.left)/g.plotW*(g.N-1));
    st.hover=Math.max(0,Math.min(g.N-1,idx));
    updateCross();
  }
  function zoomAtFrac(u,factor){   // 화면 가로위치 u 고정점으로 창 폭 factor배 (＜1=확대)
    const g=st.geom; if(!g)return;
    const [a,b]=st.zoom, anchorF=a+u*(b-a);
    const span=Math.min(1,Math.max(g.minSpan,(b-a)*factor));
    const nw0=Math.min(1-span,Math.max(0,anchorF-u*span));
    st.zoom=[nw0,nw0+span]; render();
  }
  function zoomCenter(f){   // ＋/−: 크로스헤어(보고 있는 지점) 중심, 없으면 화면 중앙
    const g=st.geom;
    const u=g&&st.hover!=null?Math.max(0,Math.min(1,(g.xAt(st.hover)-PADC.left)/g.plotW)):0.5;
    zoomAtFrac(u,f);
  }
  const panSpan=()=>st.zoom[1]-st.zoom[0];
  const canPan=()=>panSpan()<0.9999;          // 전체보기면 밀 여백이 없다
  function panTo(w0,span){   // 창 폭(span) 유지하고 시작점만 이동 — 확대·축소 없음
    const nw0=Math.min(1-span,Math.max(0,w0));
    if(Math.abs(nw0-st.zoom[0])<1e-9)return;
    st.zoom=[nw0,nw0+span]; render();
  }
  // 마우스(PC): 수정 이전과 동일 — 커서를 따라 크로스헤어가 바로 움직인다(클릭 불필요, 벗어나도 수치 유지).
  // 터치 직후 브라우저가 쏘는 호환 마우스 이벤트는 무시(lastTouchT 가드).
  let lastTouchT=0, pan=null;
  const mouseOK=()=>Date.now()-lastTouchT>700;
  hit.addEventListener('mousemove',e=>{
    if(!st.geom||!mouseOK()||pan)return;   // 팬 중엔 크로스헤어 고정 (같은 데이터점을 계속 가리킴)
    setHoverAtX(e.clientX-canvas.getBoundingClientRect().left);
  });
  // 확대 상태에서 왼쪽 버튼으로 잡아끌기 = 시점 이동. 크로스헤어는 클릭 없이 mousemove로 따라오므로
  //   버튼을 누른 동안만 팬으로 바꿔도 종전 동작을 잃지 않는다 (누른 지점에 크로스헤어는 먼저 찍어둔다).
  hit.addEventListener('mousedown',e=>{
    if(!st.geom||!mouseOK()||e.button!==0)return;
    setHoverAtX(e.clientX-canvas.getBoundingClientRect().left);
    if(!canPan())return;
    e.preventDefault();                    // 드래그 중 텍스트 선택 방지
    pan={clientX:e.clientX,z0:st.zoom[0],span:panSpan()};
    hit.classList.add('panning');
  });
  // 창 단위로 받아 차트 밖으로 끌고 나가도 이어지고, 어디서 떼도 확실히 끝난다
  window.addEventListener('mousemove',e=>{
    if(!pan||!st.geom)return;
    panTo(pan.z0-((e.clientX-pan.clientX)/st.geom.plotW)*pan.span,pan.span);   // 오른쪽으로 끌면 과거로
  });
  const endPan=()=>{ if(pan){pan=null;hit.classList.remove('panning');} };
  window.addEventListener('mouseup',endPan);
  window.addEventListener('blur',endPan);
  // 터치 전용(포인터 이벤트): 한 손가락=소환 후 '잡아서 밀기', 두 손가락=핀치 확대/팬
  const ptrs=new Map(); let pinch=null, drag=null;
  const pinchDist=()=>{const p=[...ptrs.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1;};
  const pinchMidPx=()=>{const p=[...ptrs.values()];return (p[0].x+p[1].x)/2-canvas.getBoundingClientRect().left;};
  const endTouch=e=>{if(e.pointerType==='touch'){lastTouchT=Date.now();ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;}};
  hit.addEventListener('pointerdown',e=>{
    const g=st.geom; if(!g||e.pointerType!=='touch')return;
    lastTouchT=Date.now();
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2){   // 핀치 시작: 고정점=크로스헤어(없으면 두 손가락 중점), 중점 이동=팬
      const midU0=Math.max(0,Math.min(1,(pinchMidPx()-PADC.left)/g.plotW));
      const u=st.hover!=null?Math.max(0,Math.min(1,(g.xAt(st.hover)-PADC.left)/g.plotW)):midU0;
      pinch={startDist:pinchDist(),span0:st.zoom[1]-st.zoom[0],anchorU:u,anchorF:st.zoom[0]+u*(st.zoom[1]-st.zoom[0]),midU0};
      drag=null; return;
    }
    const x=e.clientX-canvas.getBoundingClientRect().left;
    if(st.hover==null){ setHoverAtX(x); drag={clientX:e.clientX,crossX:x}; }   // 소환
    else drag={clientX:e.clientX,crossX:g.xAt(st.hover)};                       // 잡아서 밀기
  });
  hit.addEventListener('pointermove',e=>{
    const g=st.geom; if(!g||e.pointerType!=='touch')return;
    lastTouchT=Date.now();
    if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&ptrs.size>=2){   // 벌리기=크로스헤어 고정 확대, 나란히 밀기=좌우 팬
      const scale=pinch.startDist/pinchDist();
      const span=Math.min(1,Math.max(g.minSpan,pinch.span0*scale));
      const midU=Math.max(0,Math.min(1,(pinchMidPx()-PADC.left)/g.plotW));
      const u=pinch.anchorU+(midU-pinch.midU0);
      const nw0=Math.min(1-span,Math.max(0,pinch.anchorF-u*span));
      st.zoom=[nw0,nw0+span]; render(); return;
    }
    if(!drag)return;
    const gain=g.N>1?Math.max(1,g.plotW/(g.N-1)/24):1;   // 점이 성긴 차트만 드래그 감도 증폭
    setHoverAtX(drag.crossX+(e.clientX-drag.clientX)*gain);
  });
  hit.addEventListener('pointerup',e=>{endTouch(e);drag=null;});
  hit.addEventListener('pointercancel',e=>{endTouch(e);drag=null;});
  hit.addEventListener('pointerleave',e=>{endTouch(e);drag=null;});   // 수치는 유지
  // PC 휠: 상하 = 커서 지점 중심 확대/축소, 좌우(트랙패드 가로 스와이프·Shift+휠·틸트휠) = 시점 이동.
  //   (passive:false로 페이지 스크롤 차단)
  canvas.addEventListener('wheel',e=>{
    const g=st.geom; if(!g)return;
    e.preventDefault();
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){        // 가로 스크롤 = 팬 (확대율 유지)
      if(!canPan())return;
      const dm=e.deltaMode===1?16:e.deltaMode===2?g.plotW:1;   // 줄·페이지 단위 → px 근사
      panTo(st.zoom[0]+(e.deltaX*dm/g.plotW)*panSpan(),panSpan());   // 오른쪽으로 굴리면 미래로
      return;
    }
    const px=e.clientX-canvas.getBoundingClientRect().left;
    const u=Math.max(0,Math.min(1,(px-PADC.left)/g.plotW));
    zoomAtFrac(u,e.deltaY<0?0.8:1.25);
  },{passive:false});
  new ResizeObserver(en=>{const cr=en[0].contentRect; st.W=cr.width; st.H=cr.height; render();}).observe(canvas);
  return {
    setData(dates,series){
      // 같은 뷰의 재계산(동일 기간)은 확대·크로스헤어 유지, 기간이 바뀌면 초기화
      const same=st.dates.length===dates.length&&st.dates[0]===dates[0]&&st.dates[st.dates.length-1]===dates[dates.length-1];
      st.dates=dates; st.series=series;
      if(!same){st.zoom=[0,1]; st.hover=null;}
      if(st.hover!=null&&st.hover>=dates.length)st.hover=dates.length?dates.length-1:null;
      render();
    },
    /* 페이지가 만든 버튼을 그 곡선의 켜기/끄기 스위치로 — 2026-08-02.
       켜짐/꺼짐 글자는 버튼의 data-on·data-off 로 준다(없으면 글자는 그대로, class='off'만 붙는다).
       끈 상태는 **곡선 이름 기준**이라 setData 뒤에도 유지된다(재계산·재비교해도 끈 채로).
       addEventListener가 아니라 onclick= 로 걸어, 같은 요소에 두 번 걸려도 핸들러가 쌓이지 않게.
       상태는 저장하지 않는다(로그축 토글과 같은 규칙 — 페이지를 새로 열면 늘 켜짐). */
    bindToggle(el,name){
      if(!el)return;
      const paint=()=>{const on=!st.hidden.has(name);
        el.classList.toggle('off',!on); el.setAttribute('aria-pressed',String(on));
        const t=on?el.dataset.on:el.dataset.off; if(t)el.textContent=t;};
      el.onclick=()=>{ st.hidden.has(name)?st.hidden.delete(name):st.hidden.add(name); paint(); render(); };
      paint();
    }
  };
}
window.initChart=initChart;   // 페이지 인라인 스크립트에서 호출
})();
