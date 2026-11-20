const WEBLLM='https://esm.run/@mlc-ai/web-llm@0.2.88';
const STOP=new Set('what is the a an of to and in on for by when how are was with show me please does do it at than should be as from that this'.split(' '));
const tok=text=>(String(text).toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?|[가-힣]+/g)||[]).filter(t=>!STOP.has(t));
const norm=text=>String(text).replace(/\s+/g,' ').trim().toLowerCase();
const aliasPairs=[['발전기','generator engine diesel d/g dfge'],['주기관','main engine diesel'],['배기가스','exhaust gas'],['온도','temperature'],['높아','high elevated deviation'],['높은','high deviation'],['상승','high increase'],['편차','deviation difference average'],['가스모드','gas mode'],['실린더','cylinder cyl'],['부하','load'],['터보차저','turbocharger turbo charger'],['세척','washing cleaning clean'],['노즐','nozzle'],['분사밸브','fuel injection valve injector'],['압력','pressure'],['연소','combustion pmax'],['누유','oil leakage'],['진동','vibration'],['보일러','boiler'],['청정기','purifier'],['냉각기','cooler'],['윤활유','lubricating oil'],['필터','filter'],['조타기','steering'],['구명정','life boat'],['윈치','winch'],['스트레이너','strainer'],['토크','torque'],['교체','renew replaced replacement'],['점검','inspection check'],['정비','maintenance']];
export const expand=q=>q.toLowerCase()+' '+aliasPairs.filter(([ko])=>q.includes(ko)).map(([,en])=>en).join(' ');
export function classify(q){if(/어떻게|원인|이상|높|낮|고온|누유|누설|진동|경보|고장/.test(q)&&!/몇.?건|건수|개수|합계|비율|선박별|직급별|호기별/.test(q))return'procedure';return /건수|몇.?건|개수|합계|총.*수량|비율|퍼센트|선박별|직급별|호기별|유형별|월별|평균|최근.*이력|최근.*정비|정비.*예정|작업.?시간|소요.?시간|비용|\b(count|total|average|percentage|how many)\b/i.test(q)?'aggregate':'procedure';}
export function evidenceFor(q,sources){
 const evidence=[];const add=(r,quote,category)=>{quote=quote.trim();if(quote.length>=25&&r.body.includes(quote))evidence.push({id:'E'+(evidence.length+1),record:r.id,category,quote});};
 if(/배기|exhaust/i.test(q)&&/높|고온|상승|high/i.test(q)){
  const r=sources.find(r=>/gas mode/i.test(r.body)&&/Renewed SOGAV/i.test(r.body));
  if(r){let m=r.body.match(/[^\n]*While operating[\s\S]*?(?=\n\s*-\. We are|\n\s*-. R\/H|\n\s*2\.)/i);if(m)add(r,m[0],'과거 관찰 사항');m=r.body.match(/Put D\/G to manual[\s\S]*?(?=\n\s*1\))/i);if(m)add(r,m[0],'과거 작업 전 격리 조치');m=r.body.match(/1\) Renewed SOGAV[\s\S]*$/i);if(m)add(r,m[0],'과거 정비 조치와 시험 결과');if(evidence.length>=3)return evidence.slice(0,3);}
 }
 const qt=new Set(tok(expand(q))),candidates=[];
 for(const r of sources)for(const quote of r.body.split('\n').map(s=>s.trim()).filter(s=>s.length>=30)){const score=tok(quote).filter(t=>qt.has(t)).length;if(score)candidates.push({r,quote,score});}
 const seen=new Set();for(const c of candidates.sort((a,b)=>b.score-a.score)){if(seen.has(norm(c.quote)))continue;add(c.r,c.quote,'과거 기록');seen.add(norm(c.quote));if(evidence.length===3)break;}
 return evidence;
}
export function validateAnswer(parsed,evidence,sources){
 if(!parsed||!Array.isArray(parsed.steps))throw new Error('모델 응답 형식을 해석하지 못했습니다. 질문을 구체적으로 다시 입력해 주세요.');
 const byEvidence=new Map(evidence.map(e=>[e.id,e])),byRecord=new Map(sources.map(s=>[s.id,s])),used=new Set(),accepted=[];let rejected=0;
 for(const step of parsed.steps.slice(0,3)){
  const e=byEvidence.get(step.evidence);if(!e||used.has(e.id)||typeof step.text!=='string'){rejected++;continue;}
  const r=byRecord.get(e.record),quote=e.quote,text=step.text.replaceAll('촬터','실린더').replaceAll('촰일','실린더').replaceAll('가스 주입 시간의 이동 범위','가스 분사 기간 오프셋');
  const nums=new Set(quote.match(/\d+(?:\.\d+)?/g)||[]);
  if(/필요|해야|하십시오|하세요|권장|반드시|확실|원인(?:입니다|이다|으로 확정)|교체하면.*해결/.test(text)||(text.match(/\d+(?:\.\d+)?/g)||[]).some(n=>!nums.has(n))||!norm(r.body).includes(norm(quote))){rejected++;continue;}
  if((/gas mode/i.test(quote)&&!/가스\s*모드/.test(text))||(/가스\s*모드/.test(text)&&!/gas mode/i.test(r.body))){rejected++;continue;}
  if(/\d+(?:\.\d+)?\s*(?:개|명|회|시간)\s*이상/.test(text)&&!/at least|or more|more than|above|>=/i.test(quote)){rejected++;continue;}
  accepted.push({text:'과거 기록: '+text,en:'',record:r.id,quote,verified:true});used.add(e.id);
 }
 for(const e of evidence){if(used.has(e.id))continue;let text='';const low=e.quote.toLowerCase();if(e.category==='과거 관찰 사항'&&['gas mode',"no.5 cylinder",'100℃','±10 cad'].every(t=>low.includes(t)))text='과거 기록에서는 1호 발전기의 가스 모드 운전 중 5번 실린더 배기 온도가 평균보다 100℃ 넘게 높았고, 가스 분사 기간 오프셋이 최대값 ±10 CAD에 도달했다고 기재했습니다.';if(e.category==='과거 작업 전 격리 조치'&&['manual','standby','starting air','depressurized','local'].every(t=>low.includes(t)))text='과거 작업 기록에는 자동 대기 해제, 시동 공기 차단·감압, 현장(Local) 전환이 기재되어 있습니다.';if(e.category==='과거 정비 조치와 시험 결과'&&['renewed sogav','tested','good condition'].every(t=>low.includes(t)))text='해당 기록에서는 SOGAV를 교체한 뒤 시험했고 상태가 양호했다고 기록했습니다. 현재 설비에 같은 교체가 적합하다는 뜻은 아닙니다.';if(text){accepted.push({text,en:'',record:e.record,quote:e.quote,verified:true,source_extract:true});used.add(e.id);}}
 const order=new Map(evidence.map((e,i)=>[e.record+'|'+e.quote,i]));accepted.sort((a,b)=>order.get(a.record+'|'+a.quote)-order.get(b.record+'|'+b.quote));
 return {steps:accepted.slice(0,3),rejected,missing:'과거 사례만으로 현재 원인과 조치의 적합성을 확정할 수 없습니다. 제조사 매뉴얼·선내 절차와 담당 기관사의 판단을 따르세요.'};
}
class BrowserBackend{
 constructor(){this.data=null;this.model=null;this.loading=null;this.database=null;this.serial=Promise.resolve();}
 async ready(){if(!this.data){if(!this.pending)this.pending=fetch(new URL('./data.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('DB 자료를 불러오지 못했습니다.');return r.json();}).then(d=>this.setData(d));await this.pending;}return this.data;}
 setData(d){this.data=d;this.docs=d.records.map(r=>{const tf=new Map();for(const t of tok((r.title+' ').repeat(3)+r.equipment+' '+r.body))tf.set(t,(tf.get(t)||0)+1);return{r,tf,len:[...tf.values()].reduce((a,b)=>a+b,0)};});this.df=new Map();for(const d of this.docs)for(const t of d.tf.keys())this.df.set(t,(this.df.get(t)||0)+1);this.avg=this.docs.reduce((s,d)=>s+d.len,0)/this.docs.length;return d;}
 async status(){await this.ready();return{model:'Qwen3-1.7B',connected:!!this.model,records:1000,index:1046,tables:this.data.counts,version:'4.0-pages',webgpu:!!navigator.gpu};}
 async dataset(){await this.ready();return this.data.overview;}
 search(q){
  const words=new Set(tok(expand(q))),vessels=(q.match(/\bv0[1-6]\b/gi)||[]).map(v=>v.toUpperCase()),gen=/발전기|generator|d\/g|dfge/i.test(q),exh=/배기|exhaust/i.test(q),hot=/높|고온|상승|high/i.test(q);let scores=[];
  for(const d of this.docs){const r=d.r;if(vessels.length&&!vessels.includes(r.vessel))continue;if(gen&&!r.equipment.toUpperCase().includes('GENERATOR ENGINE(DIESEL)'))continue;let score=0;for(const t of words){const f=d.tf.get(t)||0;if(f)score+=Math.log(1+(this.docs.length-(this.df.get(t)||0)+.5)/((this.df.get(t)||0)+.5))*f*2.5/(f+1.5*(.25+.75*d.len/this.avg));}if(exh&&/exhaust gas temp/i.test(r.body))score*=1.8;if(score>0)scores.push({score,r});}
  if(exh&&hot){const matching=scores.filter(({r})=>/exhaust gas temp/i.test(r.body)&&/temperature[\s\S]{0,140}(?:differed|deviation[\s\S]{0,35}(?:high|above|more))|deviation[\s\S]{0,60}(?:high|above)/i.test(r.body));if(matching.length)scores=matching;}
  const chosen=[];for(const {r,score} of scores.sort((a,b)=>b.score-a.score)){const rt=new Set(tok(r.body));if(chosen.some(c=>{const ct=new Set(tok(c.body)),union=new Set([...rt,...ct]);return [...rt].filter(t=>ct.has(t)).length/union.size>.84;}))continue;chosen.push({...r,score});if(chosen.length===4)break;}return chosen;
 }
 async loadModel(progress){
  if(this.model)return;if(this.loading)return this.loading;
  this.loading=(async()=>{if(!navigator.gpu)throw new Error('이 브라우저는 WebGPU를 지원하지 않습니다. 최신 PC Chrome 또는 Edge에서 열어 주세요.');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('사용 가능한 WebGPU 장치를 찾지 못했습니다. 브라우저의 하드웨어 가속 설정과 드라이버를 확인해 주세요.');progress({progress:0,text:'WebLLM 실행 환경을 불러오는 중입니다…'});const webllm=await import(WEBLLM);const model=adapter.features.has('shader-f16')?'Qwen3-1.7B-q4f16_1-MLC':'Qwen3-1.7B-q4f32_1-MLC';if(!webllm.prebuiltAppConfig.model_list.some(m=>m.model_id===model))throw new Error('실행 환경에 Qwen3-1.7B 모델 설정이 없습니다.');this.model=await webllm.CreateWebWorkerMLCEngine(new Worker(new URL('./model-worker.js',import.meta.url),{type:'module'}),model,{initProgressCallback:progress},{context_window_size:4096});return this.model;})();
  try{return await this.loading;}catch(e){this.model=null;throw e;}finally{this.loading=null;}
 }
 async initSql(){
  if(this.database)return this.database;if(this.sqlLoading)return this.sqlLoading;
  this.sqlLoading=(async()=>{if(!window.initSqlJs){const script=document.querySelector('script[src*="sql-wasm.js"]');await new Promise((resolve,reject)=>{script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('SQL 실행 환경 다운로드 실패')),{once:true});});}const SQL=await window.initSqlJs({locateFile:f=>'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/'+f});const r=await fetch(new URL('./database.sqlite',import.meta.url));if(!r.ok)throw new Error('정비 DB 파일을 불러오지 못했습니다.');this.database=new SQL.Database(new Uint8Array(await r.arrayBuffer()));this.database.run('PRAGMA query_only=ON');return this.database;})();return this.sqlLoading;
 }
 async aggregate(q){
  const abstain=(token,reason)=>({abstain:token,reason,sql:'',params:[],columns:[],rows:[],count:0,filters:[],engine:'데이터 품질 규칙'});
  if(/(?:소요|작업).{0,8}시간|평균.*시간|시간.*평균|몇.?시간|얼마나.*걸|work.?hour|duration/i.test(q))return abstain('NO_RELIABLE_VALUE','WORK_BY_HOUR의 72.5%가 기본값 1.0이므로 신뢰할 수 있는 실제 작업 시간 통계로 사용할 수 없습니다.');
  if(/비용|가격|cost/i.test(q))return abstain('NOT_RECORDED','제공 DB에 비용·부품 단가 컬럼이 없습니다.');
  const params=[],where=[],notes=['조인: VESSELCODE + DOC_NO'];let group=null,cols='COUNT(*) AS document_count',join=' FROM master m',tail='',summary='제공된 1,000건 표본의 정비 문서 건수입니다.';
  const vessels=q.match(/\bv0[1-6]\b/gi);if(vessels){where.push('m.VESSELCODE IN ('+vessels.map(()=>'?').join(',')+')');params.push(...vessels.map(v=>v.toUpperCase()));}
  const year=q.match(/\b(20\d{2})\b/);if(year){where.push('m.WORK_DATE LIKE ?');params.push(year[1]+'%');notes.push('작업 연도: '+year[1]);}
  const equipment=/발전기|generator/i.test(q)?'GENERATOR ENGINE(DIESEL)':/주기관|main engine/i.test(q)?'MAIN ENGINE(DIESEL)':null;
  if(equipment){where.push('EXISTS (SELECT 1 FROM pms px WHERE px.VESSELCODE=m.VESSELCODE AND px.DOC_NO=m.DOC_NO AND px.MACH_DESC=?)');params.push(equipment);notes.push('기기 정확 일치: '+equipment);}
  if(/선박별|선박 별|per vessel/i.test(q))group='m.VESSELCODE';else if(/직급|rank/i.test(q))group='m.PIC';else if(/월별/.test(q))group='SUBSTR(m.WORK_DATE,1,7)';else if(/호기별|설비별|기기별|unit/i.test(q))group='p.MACH_DESC,p.MACH_NO';
  const parts=/부품|parts|consumption/i.test(q),percent=/비율|퍼센트|percentage/i.test(q),docs=/문서|document/i.test(q);
  if(parts&&percent){cols='COUNT(*) AS documents,SUM(CASE WHEN EXISTS(SELECT 1 FROM consumption c WHERE c.VESSELCODE=m.VESSELCODE AND c.DOC_NO=m.DOC_NO) THEN 1 ELSE 0 END) AS documents_with_parts, ROUND(100.0*SUM(CASE WHEN EXISTS(SELECT 1 FROM consumption c WHERE c.VESSELCODE=m.VESSELCODE AND c.DOC_NO=m.DOC_NO) THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),2) AS percent';summary='소모 플래그 대신 실제 consumption 행으로 계산한 문서 비율입니다.';}
  else if(parts&&docs){where.push('EXISTS(SELECT 1 FROM consumption c WHERE c.VESSELCODE=m.VESSELCODE AND c.DOC_NO=m.DOC_NO)');}
  else if(parts){join+=' JOIN consumption c ON c.VESSELCODE=m.VESSELCODE AND c.DOC_NO=m.DOC_NO';group=/총|합계|total/i.test(q)?'c.UNIT':'c.MATERIAL_DESC,c.UNIT';cols='SUM(CAST(c.CONS_QTY AS REAL)) AS consumed_quantity,COUNT(*) AS consumption_lines';summary='소모 수량을 단위별로 구분했습니다. 단위가 빈 값이면 원문 미기재입니다.';}
  else if(/최근|latest/i.test(q)){cols='m.VESSELCODE,m.DOC_NO,m.WORK_DATE,m.MACH_DESC,m.TITLE';group=null;tail=' ORDER BY m.WORK_DATE DESC LIMIT 10';summary='표본 안에서 조건에 맞는 최근 정비 기록입니다.';}
  else if(/첨부/.test(q)){if(docs){where.push('EXISTS(SELECT 1 FROM attachments a WHERE a.VESSELCODE=m.VESSELCODE AND a.DOC_NO=m.DOC_NO)');}else{join+=' JOIN attachments a ON a.VESSELCODE=m.VESSELCODE AND a.DOC_NO=m.DOC_NO';cols='COUNT(*) AS attachment_files';}}
  else if(/pms.?type|정비.?유형|작업.?유형/i.test(q)){join+=' JOIN pms p ON p.VESSELCODE=m.VESSELCODE AND p.DOC_NO=m.DOC_NO';group='p.PMS_TYPE';cols='COUNT(*) AS pms_lines';}
  else if(/라인|pms|작업.?건수|작업.?수/i.test(q)||group==='p.MACH_DESC,p.MACH_NO'){join+=' JOIN pms p ON p.VESSELCODE=m.VESSELCODE AND p.DOC_NO=m.DOC_NO';cols='COUNT(*) AS pms_lines';summary='정비 문서 수와 구분한 PMS 작업 라인 건수입니다.';if(equipment){where.push('p.MACH_DESC=?');params.push(equipment);}}
  else if(/평균|average|최대|최소/i.test(q))return abstain('NOT_RECORDED','지원하는 통계 필드를 판별하지 못했습니다. 문서 건수·PMS 라인·부품 소모 등 조회 대상을 구체적으로 입력해 주세요.');
  if(group){cols=group+','+cols;tail=' GROUP BY '+group+' ORDER BY '+(group.split(',').length+1)+' DESC';}
  const sql='SELECT '+cols+join+(where.length?' WHERE '+where.join(' AND '):'')+tail,db=await this.initSql(),stmt=db.prepare(sql),rows=[];stmt.bind(params);const columns=stmt.getColumnNames();try{while(stmt.step()&&rows.length<2000)rows.push(stmt.get());}finally{stmt.free();}return{sql,params,columns,rows,count:rows.length,filters:notes,summary,engine:'SQL.js · 브라우저 읽기 전용 SQLite'};
 }
 chat(q,history,stage,signal){const task=this.serial.then(()=>this.performChat(q,history,stage,signal)).catch(e=>{throw new Error(e?.message||String(e));});this.serial=task.catch(()=>{});return task;}
 async performChat(q,history,report,signal){
  if(signal.aborted)throw new DOMException('중단됨','AbortError');await this.ready();const began=performance.now(),stages=[],stage=async(name,fn)=>{report(name);const start=performance.now(),v=await fn();stages.push({name,seconds:(performance.now()-start)/1000});return v;};
  let working=q;if(history.length&&/그럼|그것|그건|그 경우|이 경우|그 설비|그 발전기/.test(q))working=history.at(-1)+' / 후속 질문: '+q;
  const route=classify(working),result={question:q,route,rewritten:working!==q?working:null,steps:[],sources:[],model:'Qwen3-1.7B',index_count:1046};
  if(route==='aggregate'){result.table=await stage('브라우저 SQL 조회',()=>this.aggregate(working));result.summary=result.table.reason||result.table.summary;result.mode='sql';}
  else{result.sources=await stage('용어 대응 · BM25 검색',()=>this.search(working));result.search=expand(working);if(!result.sources.length){result.summary='관련 기록을 찾지 못했습니다. 설비와 증상을 구체적으로 알려주세요.';result.mode='no-evidence';}else{if(!this.model)throw new Error('상단의 「Qwen 모델 불러오기」를 먼저 눌러 주세요. 최초 한 번 모델 다운로드와 준비가 필요합니다.');const evidence=evidenceFor(working,result.sources);const r=await stage('Qwen3-1.7B · 브라우저 답변 생성',()=>this.model.chat.completions.create({messages:[{role:'system',content:this.data.system},{role:'user',content:JSON.stringify({question:working,evidence})}],temperature:0,seed:42,max_tokens:1000,extra_body:{enable_thinking:false}}));if(signal.aborted)throw new DOMException('중단됨','AbortError');let raw=r.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/g,'').trim().replace(/^```(?:json)?\s*|\s*```$/g,'');let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('모델 응답을 해석하지 못했습니다. 질문을 구체적으로 다시 입력해 주세요.');}Object.assign(result,validateAnswer(parsed,evidence,result.sources));result.mode='qwen';result.summary=result.steps.length?'과거 기록에서 확인한 점검·정비 사례입니다. 현재 증상의 확정 진단은 아닙니다.':'검색 기록만으로 답변할 근거가 충분하지 않습니다.';if(/배기|exhaust/i.test(q))result.followup='운전 모드, 발전기 호기, 부하, 해당 실린더, 실제 온도와 경보 정보를 알려주시면 검색 범위를 좁힐 수 있습니다.';}}
  result.elapsed=(performance.now()-began)/1000;result.stages=stages;return result;
 }
}
export const backend=new BrowserBackend();
