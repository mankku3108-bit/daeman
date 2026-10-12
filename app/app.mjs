import {money,exactMoney,decimal,percent,todayKorea,lastCompleted,periodInfo,filteredSales,aggregate,
  buildSale,ensureUniqueSale,saleAmounts,usageForSale,saveSaleMutation,deleteSaleMutation,closeDayMutation,inventoryAt,validateData,
  expenseCategories,buildExpense,saveExpenseMutation,deleteExpenseMutation,operatingProfit,createBackup,scaled} from './core.mjs';
import {openDatabase,readState,initialize,commitState,ConflictError} from './storage.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,state,view='dashboard',scope={mode:'month',value:'2026-09'},page=1,busy=false,editingId='',originalForm='',noticeTimer;
const pageSize=20;
const filters=()=>({menu:$('menu-filter').value,channel:$('channel-filter').value,query:$('search').value});
function setStorage(text,type='ok'){$('storage-label').textContent=text;$('storage-dot').className='dot '+type;}
function notice(text,type='success'){
  clearTimeout(noticeTimer);$('notice').hidden=false;$('notice').className='notice '+(type==='success'?'':type);$('notice').textContent=text;
}
function setBusy(value){busy=value;for(const id of ['save-sale','form-delete','confirm-closing','new-sale','open-close','reload-data','cancel-sale','close-sale','form-reload','cancel-closing','close-closing','closing-date'])$(id).disabled=value;for(const c of $('sale-form').querySelectorAll('input,select,[data-add]'))c.disabled=value;for(const b of document.querySelectorAll('[data-action]'))b.disabled=value;if(value)setStorage('저장 중');else if($('storage-label').textContent==='저장 중')setStorage('저장 확인됨');}
function inputValues(){return Object.fromEntries(new FormData($('sale-form')));}
function formSnapshot(){return JSON.stringify(inputValues());}
function showFormError(message,field=''){
  const box=$('sale-error');box.hidden=!message;box.textContent=message;
  for(const input of $('sale-form').elements)if(input.name)input.removeAttribute('aria-invalid');
  if(field){const control=$('sale-form').elements.namedItem(field);if(control instanceof HTMLElement)control.setAttribute('aria-invalid','true');}
}
function ask(message,title='내용 확인') {
  $('confirm-message').textContent=message;$('confirm-title').textContent=title;
  return new Promise(resolve=>{
    const d=$('confirm-dialog');
    const finish=value=>{d.close();$('confirm-ok').onclick=null;$('confirm-cancel').onclick=null;d.oncancel=null;resolve(value);};
    $('confirm-ok').onclick=()=>finish(true);$('confirm-cancel').onclick=()=>finish(false);
    d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();
  });
}
function renderPeriod(){
  const p=periodInfo(state.data,scope);
  $('completed-label').textContent=p.completed.length?`완료 실적 ${p.first} ~ ${p.last}`:'완료 실적 없음';
  const pending=state.data.sales.filter(s=>filteredByPeriod(s)&&!state.data.calendar.find(d=>d.date===s.date)?.record_complete).length;
  $('pending-label').textContent=p.days.length?`${p.completed.length}일 마감 · 미마감 ${p.pending.length}일 · 잠정 판매 ${pending}건`:'이 기간의 영업달력과 기록이 없습니다.';
  $('mode-day').setAttribute('aria-pressed',String(scope.mode==='day'));$('mode-month').setAttribute('aria-pressed',String(scope.mode==='month'));
  $('period-value').type=scope.mode==='day'?'date':'month';$('period-value').value=scope.value;
}
function filteredByPeriod(s){return scope.mode==='month'?s.date.startsWith(scope.value):s.date===scope.value;}
function renderSummary(sales){
  const a=aggregate(state.data,sales);const known=periodInfo(state.data,scope).completed.length>0;const valid=!a.total.issues.length;
  const val=(n)=>known?money(n):'—';
  $('summary').innerHTML=[
    ['총 순매출',valid?val(a.total.net):'계산 불가','원',`${view==='sales'?'현재 필터의':'선택 기간의'} 완료 기록 ${a.total.count.toLocaleString()}건`],
    ['판매 관련 비용',valid?val(a.total.food+a.total.packaging+a.total.fee):'계산 불가','원','식재료 + 포장 + 실제 결제수수료'],
    ['메뉴 공헌이익',valid?val(a.total.contribution):'계산 불가','원','매장 운영비를 빼기 전 메뉴 기여액','accent'],
    ['공헌이익률',known&&valid?percent(a.total.contribution,a.total.net):'—','','전체 공헌이익 ÷ 전체 순매출']
  ].map(([label,value,unit,foot,css=''])=>`<article class="stat-card ${css}"><span class="label">${label}</span><span class="value">${value}<span class="unit">${unit}</span></span><p class="foot">${foot}</p></article>`).join('');
  if(a.total.issues.length)notice(`일부 기록의 계산이 불가능합니다. ${a.total.issues[0]}`,'error');
}
function renderProfit(){
  const a=aggregate(state.data,state.data.sales.filter(filteredByPeriod));const known=periodInfo(state.data,scope).completed.length>0;
  $('menu-count').textContent=`${state.data.menus.length}개 메뉴 · 매장 / 포장 구분`;
  $('profit-rows').innerHTML=a.rows.map(r=>{
    const bad=r.issues.length>0;const val=n=>bad?'계산 불가':known?money(n):'—';
    return `<tr><td><strong>${esc(r.name)}</strong><span class="subtext">${esc(r.menu_id)}</span></td><td><span class="channel-pill ${r.channel==='포장'?'takeout':''}">${r.channel}</span></td><td>${known?r.quantity.toLocaleString():'—'}</td><td>${val(r.net)}</td><td>${val(r.food)}</td><td>${val(r.packaging)}</td><td>${val(r.fee)}</td><td class="${r.contribution<0n?'amount-negative':'amount-positive'}">${val(r.contribution)}</td><td>${known&&!bad?percent(r.contribution,r.net):'—'}</td></tr>`;
  }).join('');
}
function renderSales(){
  const rows=filteredSales(state.data,scope,filters());const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);
  $('source-count').textContent=`전체 보관 ${state.data.sales.length.toLocaleString()}건`;
  $('sales-rows').innerHTML=rows.slice((page-1)*pageSize,page*pageSize).map(s=>{
    const menu=state.data.menus.find(m=>m.menu_id===s.menu_id);const complete=state.data.calendar.find(d=>d.date===s.date)?.record_complete;
    let amount;try{amount=money(saleAmounts(s).contribution);}catch{amount='계산 불가';}
    return `<tr><td>${esc(s.date)}</td><td><strong>${esc(menu?.name||s.menu_id)}</strong><span class="subtext">${esc(s.sale_id)}</span></td><td><span class="channel-pill ${s.channel==='포장'?'takeout':''}">${esc(s.channel)}</span></td><td>${s.quantity.toLocaleString()}</td><td>${Number(s.unit_price).toLocaleString()}</td><td>${Number(s.discount_amount).toLocaleString()}</td><td>${Number(s.net_sales).toLocaleString()}</td><td>${Number(s.payment_fee).toLocaleString()}</td><td class="amount-positive">${amount}</td><td><span class="state-pill ${complete?'complete':'pending'}">${complete?'마감 완료':'잠정'}</span></td><td><button class="row-action" data-action="edit" data-id="${esc(s.sale_id)}" aria-label="${esc(s.sale_id)} 수정">수정</button><button class="row-action delete" data-action="delete" data-id="${esc(s.sale_id)}" aria-label="${esc(s.sale_id)} 삭제">삭제</button></td></tr>`;
  }).join('')||'<tr><td colspan="11" class="empty">조건에 맞는 판매 기록이 없습니다. 미마감 날짜를 판매 0으로 집계하지 않습니다.</td></tr>';
  $('page-info').textContent=`필터 결과 ${rows.length.toLocaleString()}건 · ${page} / ${pages} 페이지`;
  $('prev-page').disabled=page===1;$('next-page').disabled=page===pages;
}
function render(){
  renderPeriod();
  const names={dashboard:'종합 대시보드',sales:'판매 관리',profit:'메뉴 수익성',expenses:'비용 관리',pnl:'매장 손익',backup:'자료 백업'};
  const titles={dashboard:'기록으로 보는 메뉴의 가치',sales:'판매 기록을 정확하게',profit:'메뉴가 남긴 금액을 한눈에',expenses:'운영비를 정확하게',pnl:'판매와 비용이 연결된 손익',backup:'저장된 기록을 안전하게 보관'};
  $('view-name').textContent=names[view];$('page-title').textContent=titles[view];
  $('page-description').textContent=view==='sales'?'판매를 기록하고, 잘못된 내용을 고치고, 하루를 마감하세요.':'판매 기록과 실제 원가로 메뉴가 운영비에 보탠 금액을 확인하세요.';
  for(const button of document.querySelectorAll('[data-view]'))button.classList.toggle('active',button.dataset.view===view);
  $('sales-section').hidden=view!=='sales';$('profit-section').hidden=!['dashboard','profit'].includes(view);
  $('new-sale').hidden=!['dashboard','sales','profit'].includes(view);
  $('expenses-section').hidden=view!=='expenses';$('pnl-section').hidden=!['dashboard','pnl'].includes(view);$('backup-section').hidden=view!=='backup';
  $('summary').hidden=view==='backup';
  $('page-description').textContent=({expenses:'실제 비용을 기록하고, 변경한 날짜를 다시 마감하세요.',pnl:'마감된 판매와 같은 날짜의 실제 비용으로 계산합니다.',backup:'이 브라우저에 마지막으로 저장한 자료를 파일로 보관하세요.'})[view]||$('page-description').textContent;
  renderSummary(view==='sales'?filteredSales(state.data,scope,filters()):state.data.sales.filter(filteredByPeriod));
  if(view==='sales')renderSales();else if(['dashboard','profit'].includes(view))renderProfit();
  if(view==='expenses')renderExpenses();if(['dashboard','pnl'].includes(view))renderPnl();
  $('save-status').textContent=`저장된 자료 ${state.revision}판 · 판매 ${state.data.sales.length.toLocaleString()}건 · 비용 ${state.data.expenses.length.toLocaleString()}건`;
}
async function persist(next){
  const committed=await commitState(db,next,state.revision);
  state=committed;
  const loaded=await readState(db);
  if(!loaded||loaded.revision<committed.revision)throw new Error('기록은 저장됐지만 결과를 다시 읽지 못했습니다. 최신 자료 불러오기를 사용하세요.');
  state=loaded;render();
}
function originalSale(){return editingId?state.data.sales.find(s=>s.sale_id===editingId):null;}
function preview(){
  try{
    const original=originalSale();if(editingId&&!original)throw new Error('수정할 기록을 찾을 수 없습니다. 최신 자료를 불러오세요.');
    const sale=buildSale(state.data,inputValues(),original);
    const a=saleAmounts(sale);
    $('preview-grid').innerHTML=[['순매출',a.net],['결제수수료',a.fee],['식재료·포장비',a.food+a.packaging],['공헌이익',a.contribution]].map(([name,n])=>`<div>${name}<strong>${money(n)} 원</strong></div>`).join('');
    const keep=original&&['date','menu_id','channel'].every(k=>original[k]===sale[k]);
    $('cost-explanation').textContent=`개당 식재료 ${exactMoney(a.food/BigInt(sale.quantity))}원 · 포장 ${exactMoney(a.packaging/BigInt(sale.quantity))}원 · ${keep?'기존 판매 당시 원가 유지':'판매 날짜 가격이력 적용'} · 공헌이익률 ${percent(a.contribution,a.net)}`;
    $('usage-preview').innerHTML=usageForSale(state.data,sale).map(u=>`<span class="usage-chip">${esc(u.name)}<strong>${esc(decimal(u.quantity))} ${esc(u.unit)}</strong></span>`).join('');
    showFormError('');
    return sale;
  }catch(e){
    showFormError(e.message,e.field);$('preview-grid').innerHTML='<p>필수 입력을 확인하면 계산 결과가 나타납니다.</p>';$('cost-explanation').textContent='누락한 수수료·원가를 0으로 대신 계산하지 않습니다.';$('usage-preview').textContent='입력값 확인 후 재료 사용량을 표시합니다.';return null;
  }
}
function openSale(id=''){
  editingId=id;const original=originalSale();
  if(id&&!original){notice('수정할 판매가 없습니다. 최신 자료를 불러오세요.','error');return;}
  const last=lastCompleted(state.data);const nextDate=new Date(last+'T00:00:00Z');nextDate.setUTCDate(nextDate.getUTCDate()+1);
  const defaultDate=scope.mode==='day'?scope.value:nextDate.toISOString().slice(0,10)<=todayKorea()?nextDate.toISOString().slice(0,10):last;
  const menu=state.data.menus[0];
  const values=original||{date:defaultDate,menu_id:menu.menu_id,channel:'매장',quantity:1,unit_price:menu.price,discount_amount:0,payment_fee:''};
  for(const k of ['date','menu_id','quantity','unit_price','discount_amount','payment_fee'])$('sale-form').elements.namedItem(k).value=values[k];
  for(const radio of $('sale-form').elements.namedItem('channel'))radio.checked=radio.value===values.channel;
  $('sale-title').textContent=id?'판매 기록 수정':'판매 기록 추가';$('sale-mode').textContent=id?original.sale_id:'NEW RECORD';
  $('form-delete').hidden=!id;$('form-reload').hidden=true;originalForm=formSnapshot();preview();$('sale-dialog').showModal();
}
async function cancelSale(){
  if(busy)return;
  if(formSnapshot()!==originalForm&&!await ask('입력한 변경 내용을 저장하지 않고 닫을까요?','입력 내용 버리기'))return;
  $('sale-dialog').close();editingId='';
}
async function deleteSale(id){
  if(busy)return;const record=state.data.sales.find(s=>s.sale_id===id);
  if(!record){notice('이미 삭제된 판매입니다. 최신 자료를 불러오세요.','error');return;}
  const name=state.data.menus.find(m=>m.menu_id===record.menu_id)?.name;
  if(!await ask(`${record.date} · ${name} · ${record.channel} ${record.quantity}개\n이 판매 기록을 삭제할까요? 관련 실적은 다시 계산되고 해당 날짜는 미완료로 바뀝니다.`,'판매 기록 삭제'))return;
  setBusy(true);
  try{await persist(deleteSaleMutation(state.data,id));if($('sale-dialog').open)$('sale-dialog').close();editingId='';notice('판매 기록을 삭제했습니다. 해당 날짜를 다시 마감하세요.');}
  catch(e){notice(e.message,'error');setStorage('저장 실패','error');}
  finally{setBusy(false);}
}
$('sale-form').addEventListener('input',preview);
$('sale-menu').addEventListener('change',()=>{
  $('sale-price').value=state.data.menus.find(m=>m.menu_id===$('sale-menu').value)?.price??'';preview();
});
for(const b of document.querySelectorAll('[data-add]'))b.onclick=()=>{const value=Number($('sale-quantity').value);if(Number.isSafeInteger(value)&&Number.isSafeInteger(value+Number(b.dataset.add))){$('sale-quantity').value=value+Number(b.dataset.add);preview();}};
$('sale-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const sale=preview();if(!sale)return;
  let confirmOpen=false;
  try{
    ensureUniqueSale(state.data,sale,editingId);
    const day=state.data.calendar.find(d=>d.date===sale.date);
    if(day&&!day.is_open){if(!await ask(`${sale.date}는 휴무일입니다. 영업일로 변경하고 판매를 저장할까요?`,'휴무일 판매 확인'))return;confirmOpen=true;}
    setBusy(true);
    const next=saveSaleMutation(state.data,sale,{id:editingId,newId:'S-'+crypto.randomUUID(),confirmOpen});
    const warnings=[];
    for(const u of usageForSale(next,sale)){
      try{if(inventoryAt(next,sale.date,u.material_id)<0n)warnings.push(`${u.name} 잔량 음수`);}catch(err){warnings.push(`${u.name} 잔량 확인 불가: ${err.message}`);}
    }
    await persist(next);
    $('sale-dialog').close();editingId='';scope={mode:'day',value:sale.date};view='sales';page=1;$('menu-filter').value='';$('channel-filter').value='';$('search').value='';render();
    notice(`판매를 저장했습니다. 마감 전까지 잠정 기록입니다.${warnings.length?' 재고 확인: '+warnings.join(', '):''}`,warnings.length?'warning':'success');
  }catch(err){showFormError(err.message,err.field);$('form-reload').hidden=!(err instanceof ConflictError);setStorage(err instanceof ConflictError?'최신 자료 확인 필요':'저장 실패','error');}
  finally{setBusy(false);}
});
$('new-sale').onclick=()=>openSale();$('close-sale').onclick=cancelSale;$('cancel-sale').onclick=cancelSale;
$('sale-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelSale();});
$('form-delete').onclick=()=>deleteSale(editingId);
$('form-reload').onclick=async()=>{
  if(busy)return;
  try{const latest=await readState(db);if(!latest)throw new Error('최신 자료를 읽을 수 없습니다.');validateData(latest.data);state=latest;render();preview();$('form-reload').hidden=true;showFormError('입력값은 유지했습니다. 최신 기록과 비교하고 내용을 확인한 뒤 다시 저장하세요.');setStorage('최신 자료 확인됨');}
  catch(e){showFormError(e.message);}
};
$('sales-rows').onclick=e=>{const b=e.target.closest('[data-action]');if(!b||busy)return;b.dataset.action==='edit'?openSale(b.dataset.id):deleteSale(b.dataset.id);};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;render();};
function chooseMode(mode){if(mode===scope.mode)return;scope={mode,value:mode==='month'?scope.value.slice(0,7):`${scope.value}-${lastCompleted(state.data).startsWith(scope.value)?lastCompleted(state.data).slice(-2):'01'}`};page=1;render();}
$('mode-day').onclick=()=>chooseMode('day');$('mode-month').onclick=()=>chooseMode('month');
$('period-value').onchange=()=>{const val=$('period-value').value;if(!val){notice('조회할 날짜 또는 월을 선택하세요.','error');return;}scope.value=val;page=1;render();};
for(const id of ['menu-filter','channel-filter','search'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});
$('prev-page').onclick=()=>{page--;renderSales();};$('next-page').onclick=()=>{page++;renderSales();};
function closingInfo(){
  const date=$('closing-date').value;const sales=state.data.sales.filter(s=>s.date===date);const d=state.data.calendar.find(d=>d.date===date);
  const expenses=state.data.expenses.filter(e=>e.date===date);
  $('closing-info').textContent=`판매 집계 ${sales.length}건 · 비용 ${expenses.length}건${expenses.length?'':' (비용 미입력 · 손익 판정 보류)'} · ${d?.record_complete?'이미 마감 완료':'미마감'} · ${d&&!d.is_open?'휴무일':'영업일'}`;
  $('closing-error').hidden=true;
}
$('open-close').onclick=()=>{const dates=state.data.sales.filter(filteredByPeriod).map(s=>s.date).sort();$('closing-date').value=scope.mode==='day'?scope.value:dates.at(-1)||lastCompleted(state.data);closingInfo();$('closing-dialog').showModal();};
$('closing-date').oninput=closingInfo;$('close-closing').onclick=()=>{if(!busy)$('closing-dialog').close();};$('cancel-closing').onclick=$('close-closing').onclick;
$('closing-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('closing-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const date=$('closing-date').value;
  try{
    let confirmZero=false;
    if(!state.data.sales.some(s=>s.date===date)){
      closeDayMutation(state.data,date,{confirmZero:true});
      if(!await ask(`${date}에 판매 기록이 없습니다. 실제 판매가 0임을 확인하고 마감할까요?`,'판매 0 확인'))return;confirmZero=true;
    }
    const next=closeDayMutation(state.data,date,{confirmZero});
    if(state.data.calendar.find(d=>d.date===date)?.record_complete){$('closing-dialog').close();notice('이미 마감된 날짜입니다. 기록을 중복 생성하지 않았습니다.');return;}
    setBusy(true);await persist(next);$('closing-dialog').close();scope={mode:'day',value:date};render();notice(`${date} 마감을 저장했습니다. 완료 실적에 반영되었습니다.`);
  }catch(err){$('closing-error').hidden=false;$('closing-error').textContent=err.message;}
  finally{setBusy(false);}
};
$('reload-data').onclick=async()=>{
  if(busy)return;setBusy(true);
  try{const latest=await readState(db);if(!latest)throw new Error('기존 저장자료를 읽지 못했습니다. 자동 초기화하지 않았습니다.');validateData(latest.data);state=latest;render();notice('최신 저장자료를 불러왔습니다.');}
  catch(e){notice(e.message,'error');}
  finally{setBusy(false);}
};
async function boot(){
  try{
    db=await openDatabase();state=await initialize(db,async()=>{const response=await fetch('/data/initial.json');if(!response.ok)throw new Error('초기 자료를 읽을 수 없습니다.');return response.json();});
    const options=state.data.menus.map(m=>`<option value="${esc(m.menu_id)}">${esc(m.name)}</option>`).join('');
    $('sale-menu').innerHTML=options;$('menu-filter').insertAdjacentHTML('beforeend',options);
    const categories=expenseCategories(state.data).map(c=>`<option>${esc(c)}</option>`).join('');
    $('expense-category').innerHTML=categories;$('expense-filter').insertAdjacentHTML('beforeend',categories);
    scope={mode:'month',value:lastCompleted(state.data).slice(0,7)};
    render();$('workspace').hidden=false;$('open-close').disabled=false;$('reload-data').disabled=false;setStorage('저장 확인됨');
    if(navigator.storage?.persisted)navigator.storage.persisted().then(persisted=>{if(!persisted)$('storage-label').title='브라우저 자료 삭제 시 기록도 삭제됩니다. 같은 프로필과 주소를 사용하세요.';}).catch(()=>{});
  }catch(e){$('boot-error').hidden=false;$('boot-error').textContent=`자료를 열지 못했습니다. ${e.message} 기존 저장자료를 자동으로 지우지 않았습니다.`;setStorage('자료 접근 오류','error');$('open-close').disabled=true;$('reload-data').disabled=true;}
}
let expenseId='',expenseOriginal='',expensePage=1;
function expenseValues(){return Object.fromEntries(new FormData($('expense-form')));}
function expenseError(message,field=''){
  $('expense-error').hidden=!message;$('expense-error').textContent=message;
  for(const c of $('expense-form').elements)c.removeAttribute('aria-invalid');
  $('expense-form').elements.namedItem(field)?.setAttribute('aria-invalid','true');
}
function expenseBusy(value){
  for(const id of ['save-expense','delete-expense','cancel-expense','close-expense','expense-reload','new-expense','download-backup'])$(id).disabled=value;
  for(const c of $('expense-form').querySelectorAll('input,select'))c.disabled=value;
}
function renderExpenses(){
  const rows=state.data.expenses.filter(e=>filteredByPeriod(e)&&(!$('expense-filter').value||e.category===$('expense-filter').value)).sort((a,b)=>b.date.localeCompare(a.date)||b.expense_id.localeCompare(a.expense_id));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));expensePage=Math.min(expensePage,pages);
  $('expense-rows').innerHTML=rows.slice((expensePage-1)*pageSize,expensePage*pageSize).map(e=>{
    const complete=state.data.calendar.find(d=>d.date===e.date)?.record_complete;
    return `<tr><td>${esc(e.date)}</td><td><strong>${esc(e.category)}</strong><span class="subtext">${esc(e.expense_id)}</span></td><td>${money(scaled(e.amount))}</td><td>${esc(e.recognition)}</td><td><span class="state-pill ${complete?'complete':'pending'}">${complete?'마감 완료':'잠정'}</span></td><td><button class="row-action" data-expense="edit" data-id="${esc(e.expense_id)}">수정</button><button class="row-action delete" data-expense="delete" data-id="${esc(e.expense_id)}">삭제</button></td></tr>`;
  }).join('')||'<tr><td colspan="6" class="empty">이 기간·항목의 비용 기록이 없습니다.</td></tr>';
  $('expense-page-info').textContent=`비용 ${rows.length.toLocaleString()}건 · ${expensePage} / ${pages} 페이지`;
  $('expense-prev').disabled=expensePage===1;$('expense-next').disabled=expensePage===pages;
}
function renderPnl(){
  const p=operatingProfit(state.data,scope),bad=p.issues.length>0;
  $('pnl-status').textContent=bad?`계산 불가: ${p.issues[0]}`:!p.known?'완료 실적 없음. 미마감 날짜를 매출·비용 0으로 채우지 않습니다.':p.missing.length?`비용 미입력 ${p.missing.length}일 (${p.missing.join(', ')}) · 손익 판정 보류. 입력된 비용 합계만 표시합니다. 실제 비용이 0인 날도 0원 기록을 입력하세요.`:`완료 기록 기준 · 잠정 비용 ${p.pending}건 제외 · 순매출 − 판매 관련 비용 − 운영비`;
  const valid=p.known&&!bad,profitValid=valid&&!p.missing.length;
  const rows=[['순매출',p.sales.net],['식재료비',p.sales.food],['포장비',p.sales.packaging],['실제 결제수수료',p.sales.fee],['메뉴 공헌이익',p.sales.contribution],['실제 운영비',p.expenses],['매장 손익',p.profit]];
  $('pnl-rows').innerHTML=rows.map(([label,n])=>`<tr><td><strong>${label}</strong></td><td class="${n<0n?'amount-negative':''}">${label==='매장 손익'&&!profitValid?(p.known?'판정 보류':'—'):valid?money(n):bad?'계산 불가':'—'}</td></tr>`).join('')+`<tr><td>손익률</td><td>${profitValid?percent(p.profit,p.sales.net):'—'}</td></tr>`;
}
function openExpense(id=''){
  if(busy)return;const old=id?state.data.expenses.find(e=>e.expense_id===id):null;
  if(id&&!old){notice('대상 비용을 찾을 수 없습니다.','error');return;}
  expenseId=id;const values=old||{date:scope.mode==='day'?scope.value:lastCompleted(state.data),category:expenseCategories(state.data)[0],amount:''};
  for(const k of ['date','category','amount'])$('expense-form').elements.namedItem(k).value=values[k];
  $('expense-title').textContent=id?'비용 기록 수정':'비용 기록 추가';$('delete-expense').hidden=!id;$('expense-reload').hidden=true;expenseError('');
  expenseOriginal=JSON.stringify(expenseValues());$('expense-dialog').showModal();
}
async function cancelExpense(){if(busy)return;if(JSON.stringify(expenseValues())!==expenseOriginal&&!await ask('입력한 변경 내용을 저장하지 않고 닫을까요?','입력 내용 버리기'))return;$('expense-dialog').close();expenseId='';}
async function deleteExpense(id){
  if(busy)return;const old=state.data.expenses.find(e=>e.expense_id===id);if(!old){notice('이미 삭제됐거나 없는 비용입니다.','error');return;}
  if(!await ask(`${old.date} · ${old.category} · ${old.amount.toLocaleString()}원\n이 비용을 삭제할까요? 해당 날짜는 다시 마감해야 합니다.`,'비용 기록 삭제'))return;
  setBusy(true);expenseBusy(true);
  try{await persist(deleteExpenseMutation(state.data,id));$('expense-dialog').close();notice('비용을 삭제했습니다. 해당 날짜를 다시 마감하세요.');}
  catch(err){if($('expense-dialog').open){expenseError(err.message);$('expense-reload').hidden=!(err instanceof ConflictError);}else notice(err.message,'error');setStorage('저장 실패','error');}
  finally{setBusy(false);expenseBusy(false);}
}
$('new-expense').onclick=()=>openExpense();$('cancel-expense').onclick=cancelExpense;$('close-expense').onclick=cancelExpense;
$('expense-dialog').oncancel=e=>{e.preventDefault();cancelExpense();};$('delete-expense').onclick=()=>deleteExpense(expenseId);
$('expense-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  try{
    const expense=buildExpense(state.data,expenseValues(),state.data.expenses.find(e=>e.expense_id===expenseId));
    const next=saveExpenseMutation(state.data,expense,{id:expenseId,newId:'X-'+crypto.randomUUID()});
    setBusy(true);expenseBusy(true);await persist(next);$('expense-dialog').close();expenseId='';view='expenses';scope={mode:'day',value:expense.date};expensePage=1;$('expense-filter').value='';render();
    notice('비용을 저장했습니다. 해당 날짜를 다시 마감하세요.');
  }catch(err){expenseError(err.message,err.field);$('expense-reload').hidden=!(err instanceof ConflictError);setStorage(err instanceof ConflictError?'최신 자료 확인 필요':'저장 실패','error');}
  finally{setBusy(false);expenseBusy(false);}
};
$('expense-reload').onclick=async()=>{if(busy)return;try{const latest=await readState(db);if(!latest)throw new Error('최신 자료를 읽을 수 없습니다.');validateData(latest.data);state=latest;render();expenseError('입력값은 유지했습니다. 최신 기록을 확인한 뒤 다시 저장하세요.');$('expense-reload').hidden=true;setStorage('최신 자료 확인됨');}catch(err){expenseError(err.message);}};
$('expense-rows').onclick=e=>{const b=e.target.closest('[data-expense]');if(!b||busy)return;b.dataset.expense==='edit'?openExpense(b.dataset.id):deleteExpense(b.dataset.id);};
$('expense-filter').onchange=()=>{expensePage=1;renderExpenses();};$('expense-prev').onclick=()=>{expensePage--;renderExpenses();};$('expense-next').onclick=()=>{expensePage++;renderExpenses();};
$('download-backup').onclick=async()=>{
  if(busy)return;setBusy(true);expenseBusy(true);let url;
  try{
    const saved=await readState(db),backup=createBackup(saved);const blob=new Blob([JSON.stringify(backup.document,null,2)],{type:'application/json;charset=utf-8'});
    url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=backup.filename;document.body.append(a);a.click();a.remove();
    $('backup-status').textContent=`백업 파일 내려받기 시작: ${backup.filename} · 저장 자료 ${saved.revision}판 · 미저장 입력 제외. 내려받은 파일을 확인해 보관하세요.`;
  }catch(err){$('backup-status').textContent=`백업 생성 실패: ${err.message} 기존 자료는 변경하지 않았습니다.`;}
  finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),10000);setBusy(false);expenseBusy(false);}
};
boot();
