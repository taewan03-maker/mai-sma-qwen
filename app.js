import {backend} from './browser-engine.js?v=4.0.2';
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prompts=['발전기 배기가스 온도가 높아 어떻게 해야 해?','발전기 터보차저 세척 시 엔진 부하와 온도는?','발전기 연료 분사밸브 노즐은 어떻게 점검했어?','주기관 기동 공기밸브 점검 기록을 찾아줘','보일러 안전밸브 점검 사례를 알려줘','청정기에서 진동이 발생한 정비 기록이 있어?','계선 윈치 유압 스트레이너 막힘 기록을 찾아줘','구명정 진수장치 정비 기록을 알려줘','선박별 정비 문서 건수를 보여줘','발전기 정비 작업 라인은 호기별로 몇 건인가?','부품 소모 기록이 있는 문서 비율은?','2025년 부품 총 소모 수량은?','직급별 정비 문서 건수를 보여줘','정비 작업 시간 평균을 구할 수 있어?'];
let chats=[],activeId=null,settings={bilingual:true,dark:false},status=null,busy=false,controller=null,epoch=0,timer=null;
try{const c=JSON.parse(localStorage.getItem('mai-qwen-pages-chats')||'[]');if(Array.isArray(c))chats=c.filter(v=>v&&typeof v.id==='string'&&Array.isArray(v.messages)).slice(0,20);settings={...settings,...JSON.parse(localStorage.getItem('mai-qwen-pages-prefs')||'{}')};}catch{}
const current=()=>chats.find(c=>c.id===activeId);
function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,3500);}
function save(){try{localStorage.setItem('mai-qwen-pages-chats',JSON.stringify(chats.slice(0,20)));}catch{toast('대화가 길어 브라우저에 저장하지 못했습니다. 설정에서 내보내기 후 정리해 주세요.');}}
function prefs(){document.body.classList.toggle('dark',settings.dark);document.body.classList.toggle('hide-english',!settings.bilingual);$('#theme').setAttribute('aria-checked',String(settings.dark));$('#theme .switch').classList.toggle('on',settings.dark);$('#bilingual').setAttribute('aria-checked',String(settings.bilingual));$('#bilingual .switch').classList.toggle('on',settings.bilingual);try{localStorage.setItem('mai-qwen-pages-prefs',JSON.stringify(settings));}catch{}}
function closeNav(){$('#sidebar').classList.remove('open');$('#shade').classList.remove('open');}
function draw(){
 $('#historyCount').textContent=chats.length;$('#history').innerHTML=chats.map(c=>`<button data-chat="${esc(c.id)}" class="${c.id===activeId?'active':''}" title="${esc(c.title)}"><span>${esc(c.title)}</span><small>${c.messages.length}</small></button>`).join('');
 const chat=current();
 if(!chat?.messages.length){$('#conversation').innerHTML=`<div class="data-line"><span>LOCAL DATA</span>공개 교육용 DB · 정비 문서 1,000건 · 색인 1,046건</div><section class="welcome"><span class="spark">✦</span><h2>기록에서 답을 찾아보세요</h2><p>증상이나 궁금한 작업을 편하게 물어보세요.<br>Qwen3-1.7B가 관련 정비 기록을 읽고 근거와 함께 답합니다.</p><div class="welcome-grid">${[0,1,8,10].map(i=>`<button data-prompt="${i}">${esc(prompts[i])}<small>${i<8?'유사 정비 기록 검색':'읽기 전용 데이터 집계'}</small></button>`).join('')}</div></section>`;return;}
 $('#conversation').innerHTML=chat.messages.map((m,i)=>`<section class="turn"><div class="question-bubble">${esc(m.question)}</div><div class="answer-wrap"><span class="answer-spark" aria-hidden="true">✦</span><div class="answer">${m.result?resultHTML(m.result,i):m.error?`<div class="error">${esc(m.error)}</div>`:'<div class="pending"><span class="spinner"></span>Qwen이 관련 기록을 확인하고 있습니다…</div>'}</div></div></section>`).join('');
}
function resultHTML(r,turn){
 let body='';
 if(r.route==='aggregate'){
  const t=r.table;body=t.abstain?`<div class="empty-answer"><strong>${esc(t.abstain)}</strong><p>${esc(r.summary)}</p></div>`:`<p class="answer-summary">${esc(r.summary)}</p><div class="table-scroll"><table><thead><tr>${t.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0,50).map(row=>`<tr>${row.map(v=>`<td>${v===null||v===''?'미기재':esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="table-note">${esc(t.filters?.join(' · '))} · ${t.count}행 중 ${Math.min(50,t.count)}행 표시</p>`;
 }else{
  body=`<p class="answer-summary">${esc(r.summary)}</p>`+(r.steps||[]).map((s,i)=>{
   const src=r.sources.find(v=>v.id===s.record);return `<article class="step"><div class="step-title"><span class="step-num">${i+1}</span><span>${esc(s.text)}</span></div><div class="step-inner">${s.en?`<p class="english">${esc(s.en)}</p>`:''}<div class="citation"><span class="badge">verified</span><button class="source-link" data-source="${esc(s.record)}" data-turn="${turn}"><strong>${src?.kind==='reference'?'참고 기록':esc(src?.vessel||'Record')}</strong> ${esc(src?.equipment||'')} · ${esc(src?.date||'')} · ${esc(src?.id||'')}</button></div><blockquote>“${esc(s.quote)}”</blockquote></div></article>`;
  }).join('');
  if(r.steps?.length)body+=`<div class="verification">Citations verified ${r.steps.length}/${r.steps.length} (100%)<div class="bar"><span style="width:100%"></span></div><p>표시된 인용문은 원문 포함 여부를 확인했습니다. 답변 전체의 의미나 작업 안전성까지 검증한 것은 아닙니다.${r.rejected?` 생성 문장 ${r.rejected}개를 제외하고 필요한 항목은 원문으로 보완했습니다.`:''}</p></div>`;
  if(r.missing)body+=`<p class="missing-note"><strong>기록의 한계</strong> ${esc(r.missing)}</p>`;
  if(r.followup)body+=`<p class="followup">${esc(r.followup)}</p>`;
 }
 body+=`<div class="trace"><div class="trace-label">HOW THIS WAS PRODUCED</div><div class="trace-summary"><span class="route-chip">${r.route==='aggregate'?'Aggregate query':'Procedure query'}</span><strong>${Number(r.elapsed).toFixed(1)}s total</strong><span>${r.mode==='qwen'?'Qwen3-1.7B 생성 · 원문 검증':r.mode==='sql'?'브라우저 SQL 조회':'근거 없음'}</span>${r.route!=='aggregate'?`<span>${r.sources.length} sources</span>`:''}</div><div class="stage-list">${r.stages.map(s=>`<span>✓ ${esc(s.name)} ${s.seconds.toFixed(1)}s</span>`).join('')}</div>${r.rewritten?`<details><summary>후속 질문 검색 문맥</summary><pre>${esc(r.rewritten)}</pre></details>`:''}<details ${r.route==='aggregate'&&!r.table.abstain?'open':''}><summary>${r.route==='aggregate'?'SQL executed · 실제 실행 쿼리':`Search executed · BM25 · top 4 · ${r.index_count.toLocaleString()} records indexed`}</summary><pre>${esc(r.route==='aggregate'?(r.table.sql||r.table.abstain)+'\n\nParameters: '+JSON.stringify(r.table.params):r.search||r.question)}</pre></details>${r.sources?.length?`<details><summary>검색한 원문 ${r.sources.length}건</summary><div class="source-list">${r.sources.map(s=>`<button class="secondary" data-source="${esc(s.id)}" data-turn="${turn}">${esc(s.title)}</button>`).join('')}</div></details>`:''}</div>`;
 return body;
}
function idle(){busy=false;clearInterval(timer);$('#statusRow').hidden=true;$('#send').hidden=false;$('#stop').hidden=true;$('#question').disabled=false;}
function stop(){if(!busy)return;epoch++;controller?.abort();const m=current()?.messages.filter(v=>!v.result&&!v.error).pop();if(m)m.error='표시 요청을 중단했습니다. 이미 시작된 모델 계산이 끝난 뒤 다음 요청이 처리될 수 있습니다.';idle();save();draw();}
async function ask(q){
 q=q.trim();if(!q||busy)return;if(q.length>2000){toast('질문은 2,000자까지 입력할 수 있습니다.');return;}
 let c=current();if(!c){c={id:crypto.randomUUID(),title:q,messages:[]};chats.unshift(c);chats=chats.slice(0,20);activeId=c.id;}
 const history=c.messages.slice(-3).map(m=>m.question),msg={question:q};c.messages.push(msg);c.messages=c.messages.slice(-15);
 $('#question').value='';$('#question').style.height='auto';draw();save();closeNav();busy=true;controller=new AbortController();const run=++epoch,start=performance.now();$('#question').disabled=true;$('#send').hidden=true;$('#stop').hidden=false;$('#statusRow').hidden=false;$('#stageName').textContent='데이터 확인 중';timer=setInterval(()=>$('#elapsed').textContent=((performance.now()-start)/1000).toFixed(1)+'s',100);
 window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
 try{
  msg.result=await backend.chat(q,history,name=>$('#stageName').textContent=name,controller.signal);
 }catch(e){if(!controller.signal.aborted)msg.error=e?.message||String(e)||'모델 응답 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';}
 finally{if(run===epoch){idle();save();draw();$('#question').focus();}}
}
$('#suggestions').innerHTML=prompts.map((p,i)=>`<button data-prompt="${i}" title="${esc(p)}"><span>${esc(p)}</span></button>`).join('');
$('#composer').onsubmit=e=>{e.preventDefault();ask($('#question').value);};$('#question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask(e.target.value);}};$('#question').oninput=e=>{e.target.style.height='auto';e.target.style.height=Math.min(120,e.target.scrollHeight)+'px';};$('#stop').onclick=stop;
$('#newChat').onclick=()=>{stop();activeId=null;draw();closeNav();$('#question').focus();};
document.addEventListener('click',e=>{
 const prompt=e.target.closest('[data-prompt]');if(prompt){if(busy)stop();ask(prompts[Number(prompt.dataset.prompt)]);}
 const chat=e.target.closest('[data-chat]');if(chat){stop();activeId=chat.dataset.chat;draw();closeNav();}
 const source=e.target.closest('[data-source]');if(source){const r=current()?.messages[Number(source.dataset.turn)]?.result?.sources.find(v=>v.id===source.dataset.source);if(r){$('#sourceBody').innerHTML=`<p class="source-type">${r.kind==='reference'?'qa_proc_context · 별도 절차 참고 기록':'master · 정비 문서 이력'}</p><h3>${esc(r.title)}</h3><p class="muted">${esc(r.id)} · ${esc(r.equipment)}<br>${esc(r.date)} · ${esc(r.location)}</p><blockquote class="source-full">${esc(r.body)}</blockquote>`;$('#sourceDialog').showModal();}}
 const exportButton=e.target.closest('#exportChat');if(exportButton){const c=current();if(!c){toast('저장할 대화가 없습니다.');return;}const u=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='MAI-SMA-chat.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 const clear=e.target.closest('#clearChats');if(clear&&confirm('이 브라우저에 저장된 대화를 모두 삭제할까요?')){stop();chats=[];activeId=null;save();draw();toast('대화를 삭제했습니다.');}
});
$('#theme').onclick=()=>{settings.dark=!settings.dark;prefs();};$('#bilingual').onclick=()=>{settings.bilingual=!settings.bilingual;prefs();};$('#menu').onclick=()=>{$('#sidebar').classList.add('open');$('#shade').classList.add('open');};$('#closeSidebar').onclick=closeNav;$('#shade').onclick=closeNav;
$('#settings').onclick=async()=>{
 $('#settingsBody').innerHTML='<p>데이터와 모델 상태를 확인하고 있습니다…</p>';$('#settingsDialog').showModal();
 try{status=await backend.status();const d=await backend.dataset();$('#settingsBody').innerHTML=`<p><strong>Qwen3-1.7B · WebGPU</strong><br>${status.connected?'브라우저 모델 준비됨':'상단의 Qwen 모델 불러오기를 눌러 주세요.'}</p><p class="muted">정적 웹 · 질문과 답변은 브라우저 내 처리<br>WebLLM·SQL.js 런타임은 CDN, 모델은 Hugging Face에서 내려받습니다. 질문을 외부 추론 API로 보내지 않습니다.</p><h3>첨부 DB</h3><div class="table-scroll"><table><tr><th>테이블</th><th>행 수</th></tr>${Object.entries(status.tables).filter(([k])=>['master','pms','approval','attachments','consumption','vessels','qa_proc_context'].includes(k)).map(([k,n])=>`<tr><td>${esc(k)}</td><td>${n.toLocaleString()}</td></tr>`).join('')}</table></div><p class="muted">검색 색인: 정비 문서 741건 + 중복 제거 참고 기록 305건 = 1,046건. 참고 기록은 정비 문서 수 집계에 포함하지 않습니다.</p>${d.warnings.map(w=>`<p class="muted">${esc(w)}</p>`).join('')}<h3>대화 기록</h3><p class="muted">현재 브라우저에 최대 20개 대화·대화별 15개 질문을 저장합니다.</p><button class="secondary" id="exportChat">현재 대화 JSON 저장</button><button class="danger" id="clearChats">저장된 대화 삭제</button>`;}catch{$('#settingsBody').textContent='데이터 파일을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.';}
};
prefs();draw();
(async()=>{try{status=await backend.status();$('#connectionText').textContent=status.connected?'Qwen 브라우저 모델 준비됨':'브라우저 모델 로딩 전';$('#connectionDot').style.background=status.connected?'var(--green)':'#c38a39';$('#indexCount').textContent=`${status.records.toLocaleString()} documents · ${status.index.toLocaleString()} indexed`;for(const c of chats)for(const m of c.messages)if(!m.result&&!m.error)m.error='이전 요청이 완료되기 전에 종료되었습니다.';draw();}catch{$('#connectionText').textContent='데이터 다운로드 실패';}})();

$('#loadModel').onclick=async()=>{
 const button=$('#loadModel');button.disabled=true;$('#modelProgressBar').hidden=false;
 try{await backend.loadModel(p=>{const progress=Math.max(0,Math.min(1,p.progress||0));$('#modelProgressBar').value=progress;$('#modelProgress').textContent=p.text||'모델을 준비하는 중입니다…';});$('#modelProgress').textContent='Qwen3-1.7B가 이 브라우저에서 실행됩니다.';button.textContent='Qwen 모델 준비됨';$('#connectionText').textContent='Qwen 브라우저 모델 준비됨';$('#connectionDot').style.background='var(--green)';}
 catch(e){button.disabled=false;button.textContent='모델 불러오기 다시 시도';$('#modelProgress').textContent=e.message;toast(e.message);}
};
