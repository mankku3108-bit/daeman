export const SCALE = 1000000n;
export class ValidationError extends Error {
  constructor(message, field='') { super(message); this.name='ValidationError'; this.field=field; }
}
const fail = (message,field) => {throw new ValidationError(message,field);};
export function roundDiv(n,d) {
  if (d===0n) fail('0으로 나눌 수 없습니다.');
  const sign=(n<0n)!==(d<0n)?-1n:1n;
  n=n<0n?-n:n; d=d<0n?-d:d;
  return sign*((n+d/2n)/d);
}
export function scaled(value, label='금액') {
  if (value===null || value===undefined || value==='') fail(`${label}이 없습니다.`);
  const s=String(value);
  const m=/^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) fail(`${label}의 숫자 형식이 올바르지 않습니다.`);
  return (m[1]?-1n:1n)*(BigInt(m[2])*SCALE+BigInt((m[3]||'').padEnd(6,'0')));
}
export function decimal(n) {
  const sign=n<0n?'-':''; n=n<0n?-n:n;
  const fraction=(n%SCALE).toString().padStart(6,'0').replace(/0+$/,'');
  return sign+(n/SCALE).toString()+(fraction?'.'+fraction:'');
}
export function money(n) {
  if (n===null || n===undefined) return '계산 불가';
  return roundDiv(n,SCALE).toLocaleString('ko-KR');
}
export function exactMoney(n) {return Number(decimal(n)).toLocaleString('ko-KR',{maximumFractionDigits:4});}
export function percent(part,total) {
  if (!total) return '—';
  return (Number(roundDiv(part*1000n,total))/10).toFixed(1)+'%';
}
export function todayKorea() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s;
}
export function checkDate(date,data,today=todayKorea()) {
  if (!isDate(date)) fail('유효한 날짜를 입력하세요.','date');
  if (date<data.meta.start_date) fail(`기록은 ${data.meta.start_date} 이후 날짜만 가능합니다.`,'date');
  if (date>today) fail('미래 날짜는 기록하거나 마감할 수 없습니다.','date');
}
function integer(value,label,field,min=0) {
  const s=String(value??'').trim();
  if (!/^\d+$/.test(s)) fail(`${label}은 ${min} 이상의 정수로 입력하세요.`,field);
  const n=Number(s);
  if (!Number.isSafeInteger(n)||n<min) fail(`${label}의 허용 숫자 범위를 확인하세요.`,field);
  return n;
}
export function lastCompleted(data) {
  return data.calendar.filter(d=>d.record_complete).map(d=>d.date).sort().at(-1)||data.meta.start_date;
}
export function inPeriod(date,scope) {return scope.mode==='month'?date.startsWith(scope.value):date===scope.value;}
export function periodInfo(data,scope) {
  const days=data.calendar.filter(d=>inPeriod(d.date,scope));
  const completed=days.filter(d=>d.record_complete).sort((a,b)=>a.date.localeCompare(b.date));
  const pending=days.filter(d=>!d.record_complete).sort((a,b)=>a.date.localeCompare(b.date));
  return {days,completed,pending,first:completed[0]?.date,last:completed.at(-1)?.date};
}
export function saleAmounts(sale) {
  const qty=BigInt(integer(sale.quantity,'판매 수량','quantity',1));
  const net=scaled(sale.net_sales,'순매출');
  const fee=scaled(sale.payment_fee,'결제수수료');
  const food=scaled(sale.unit_food_cost_snapshot,'개당 식재료 원가')*qty;
  const packaging=scaled(sale.unit_packaging_cost_snapshot,'개당 포장 원가')*qty;
  if (net<0n||fee<0n||food<0n||packaging<0n) fail('판매 금액·원가는 음수가 될 수 없습니다.');
  return {net,fee,food,packaging,cost:food+packaging+fee,contribution:net-food-packaging-fee};
}
export function usageForSale(data,sale) {
  const rows=data.recipes.filter(r=>r.menu_id===sale.menu_id&&r.recipe_version===sale.recipe_version&&(!r.channel_only||r.channel_only===sale.channel));
  if (!rows.length) fail(`${sale.menu_id}의 레시피가 없습니다.`);
  return rows.map(r=>{
    const material=data.materials.find(m=>m.material_id===r.material_id);
    if (!material||material.unit!==r.unit) fail(`${r.material_id} 재료의 연결 또는 단위가 잘못됐습니다.`);
    return {material_id:r.material_id,name:material.name,unit:r.unit,quantity:scaled(r.quantity,'레시피 수량')*BigInt(sale.quantity)};
  });
}
function gcd(a,b) {while(b){[a,b]=[b,a%b];}return a;}
function rationalAdd(a,b) {const g=gcd(a[1],b[1]); return [a[0]*(b[1]/g)+b[0]*(a[1]/g),a[1]*(b[1]/g)];}
export function recipeCost(data,menu,date,channel) {
  const rows=data.recipes.filter(r=>r.menu_id===menu.menu_id&&r.recipe_version===menu.recipe_version&&(!r.channel_only||r.channel_only===channel));
  if (!rows.length) fail('선택한 메뉴의 레시피가 없습니다.','menu_id');
  let food=[0n,1n],packaging=[0n,1n];
  for (const r of rows) {
    const mat=data.materials.find(m=>m.material_id===r.material_id);
    if (!mat||mat.unit!==r.unit) fail(`${r.material_id} 재료 단위를 확인하세요.`,'menu_id');
    const price=data.price_history.filter(p=>p.material_id===r.material_id&&p.effective_date<=date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
    if (!price) fail(`${mat.name}: ${date}에 적용할 가격이력이 없습니다.`,'date');
    const q=scaled(price.pack_quantity,'구매용량'),p=scaled(price.pack_price,'구매가격'),use=scaled(r.quantity,'사용량');
    if(q<=0n||p<0n||use<0n) fail(`${mat.name}의 구매용량·가격·사용량을 확인하세요.`);
    const term=[p*use,q];
    if (['I10','I11'].includes(r.material_id)) packaging=rationalAdd(packaging,term);
    else food=rationalAdd(food,term);
  }
  const snap=x=>roundDiv(x[0],x[1]*100n)*100n;
  return {food:snap(food),packaging:snap(packaging),version:menu.recipe_version};
}
export function buildSale(data,input,existing=null,today=todayKorea()) {
  checkDate(input.date,data,today);
  const menu=data.menus.find(m=>m.menu_id===input.menu_id);
  if(!menu) fail('기존 메뉴를 선택하세요.','menu_id');
  if(!['매장','포장'].includes(input.channel)) fail('매장 또는 포장을 선택하세요.','channel');
  const quantity=integer(input.quantity,'판매 수량','quantity',1);
  const unit_price=integer(input.unit_price,'판매단가','unit_price');
  const discount_amount=integer(input.discount_amount,'할인 총액','discount_amount');
  const payment_fee=integer(input.payment_fee,'결제수수료','payment_fee');
  const gross=BigInt(quantity)*BigInt(unit_price);
  if (gross>BigInt(Number.MAX_SAFE_INTEGER)) fail('판매금액이 허용 숫자 범위를 넘습니다.','unit_price');
  if (BigInt(discount_amount)>gross) fail('할인 총액은 할인 전 판매금액보다 클 수 없습니다.','discount_amount');
  const keep=existing&&existing.date===input.date&&existing.menu_id===input.menu_id&&existing.channel===input.channel;
  const cost=keep?{food:scaled(existing.unit_food_cost_snapshot),packaging:scaled(existing.unit_packaging_cost_snapshot),version:existing.recipe_version}:recipeCost(data,menu,input.date,input.channel);
  const sale={...(existing||{}),sale_id:existing?.sale_id||'',date:input.date,menu_id:input.menu_id,channel:input.channel,
    quantity,unit_price,discount_amount,payment_fee,net_sales:Number(gross-BigInt(discount_amount)),recipe_version:cost.version,
    unit_food_cost_snapshot:keep?existing.unit_food_cost_snapshot:Number(decimal(cost.food)),
    unit_packaging_cost_snapshot:keep?existing.unit_packaging_cost_snapshot:Number(decimal(cost.packaging))};
  saleAmounts(sale); usageForSale(data,sale);
  return sale;
}
export function ensureUniqueSale(data,sale,id='') {
  const same=data.sales.find(s=>s.sale_id!==id&&s.date===sale.date&&s.menu_id===sale.menu_id&&s.channel===sale.channel);
  if (same) fail(`같은 날짜·메뉴·채널의 ${same.sale_id} 기록이 있습니다. 기존 집계행을 수정하세요.`,'date');
}
function calendarEntry(data,date) {
  let day=data.calendar.find(d=>d.date===date);
  if(!day) {day={date,is_open:true,record_complete:false,weather:'',note:''};data.calendar.push(day);}
  return day;
}
export function saveSaleMutation(data,sale,{id='',newId='',confirmOpen=false}={}) {
  const old=id?data.sales.find(s=>s.sale_id===id):null;
  if(id&&!old) fail('대상 판매를 찾을 수 없습니다. 최신 자료를 불러오세요.');
  ensureUniqueSale(data,sale,id);
  const day=data.calendar.find(d=>d.date===sale.date);
  if(day&&!day.is_open&&!confirmOpen) fail('휴무일 판매입니다. 영업일 전환을 확인하세요.','date');
  const next=structuredClone(data);
  const stored={...sale,sale_id:id||newId};
  if (!stored.sale_id||(!id&&next.sales.some(s=>s.sale_id===newId))) fail('판매ID가 중복되거나 없습니다. 최신 자료를 확인하세요.');
  if(old) next.sales[next.sales.findIndex(s=>s.sale_id===id)]=stored;
  else next.sales.push(stored);
  const current=calendarEntry(next,sale.date);current.record_complete=false;current.is_open=true;
  if(old) calendarEntry(next,old.date).record_complete=false;
  return next;
}
export function deleteSaleMutation(data,id) {
  const sale=data.sales.find(s=>s.sale_id===id);
  if(!sale) fail('이미 삭제됐거나 없는 판매 기록입니다.');
  const next=structuredClone(data); next.sales=next.sales.filter(s=>s.sale_id!==id);
  calendarEntry(next,sale.date).record_complete=false;
  return next;
}
export function closeDayMutation(data,date,{confirmZero=false,today=todayKorea()}={}) {
  checkDate(date,data,today);
  const sales=data.sales.filter(s=>s.date===date);
  if(!sales.length&&!confirmZero) fail('판매 기록이 없습니다. 실제 판매가 0인지 확인하세요.');
  for (const sale of sales) {
    saleAmounts(sale);usageForSale(data,sale);
    const expected=BigInt(sale.quantity)*BigInt(integer(sale.unit_price,'판매단가'))-BigInt(integer(sale.discount_amount,'할인액'));
    if (expected<0n || expected*SCALE!==scaled(sale.net_sales)) fail(`${sale.sale_id}: 순매출과 수량·단가·할인이 일치하지 않습니다.`);
  }
  for(const cost of data.expenses.filter(e=>e.date===date)) if(scaled(cost.amount,'비용')<0n) fail('해당 날짜 비용에 오류가 있습니다.');
  const next=structuredClone(data);calendarEntry(next,date).record_complete=true;return next;
}
export function filteredSales(data,scope,{menu='',channel='',query=''}={}) {
  const q=query.trim().toLowerCase();
  return data.sales.filter(s=>inPeriod(s.date,scope)&&(!menu||s.menu_id===menu)&&(!channel||s.channel===channel)&&(!q||`${s.sale_id} ${data.menus.find(m=>m.menu_id===s.menu_id)?.name||''}`.toLowerCase().includes(q)))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.sale_id.localeCompare(a.sale_id));
}
export function aggregate(data,sales) {
  const completed=new Set(data.calendar.filter(d=>d.record_complete).map(d=>d.date));
  const rows=[]; const total={net:0n,food:0n,packaging:0n,fee:0n,contribution:0n,quantity:0n,count:0,issues:[]};
  for (const menu of data.menus) for(const channel of ['매장','포장']) {
    const result={net:0n,food:0n,packaging:0n,fee:0n,contribution:0n,quantity:0n,count:0,issues:[],menu_id:menu.menu_id,name:menu.name,channel};
    for(const sale of sales.filter(s=>s.menu_id===menu.menu_id&&s.channel===channel&&completed.has(s.date))) {
      result.count++; result.quantity+=BigInt(sale.quantity);
      try {const a=saleAmounts(sale);for(const k of ['net','food','packaging','fee','contribution'])result[k]+=a[k];}
      catch(e){result.issues.push(`${sale.sale_id}: ${e.message}`);}
    }
    rows.push(result);
    for(const k of ['net','food','packaging','fee','contribution','quantity','count'])total[k]+=result[k];
    total.issues.push(...result.issues);
  }
  return {rows,total,pending:sales.filter(s=>!completed.has(s.date)).length};
}
export function inventoryAt(data,date,materialId) {
  const material=data.materials.find(m=>m.material_id===materialId);
  const opening=data.opening_inventory.find(x=>x.material_id===materialId);
  if(!material||!opening||date<opening.date) fail('초기재고와 기준일을 확인하세요.');
  if(opening.unit!==material.unit) fail('초기재고 단위가 맞지 않습니다.');
  let balance=scaled(opening.quantity,'초기재고');
  const dates=new Set([opening.date]);
  for(const s of data.sales)if(s.date<=date)dates.add(s.date);
  for(const e of data.inventory_events)if(e.material_id===materialId&&e.date<=date)dates.add(e.date);
  for(const day of [...dates].filter(d=>d>=opening.date&&d<=date).sort()) {
    const events=data.inventory_events.filter(e=>e.material_id===materialId&&e.date===day);
    for(const event of events) if(event.event_type!=='실사조정') {
      if(event.unit!==material.unit) fail('재고 기록 단위가 맞지 않습니다.');
      balance+=scaled(event.quantity,'재고 증감량');
    }
    for(const s of data.sales.filter(s=>s.date===day)) {
      for(const u of usageForSale(data,s)) if(u.material_id===materialId)balance-=u.quantity;
    }
    const measured=events.filter(e=>e.event_type==='실사조정'&&e.counted_quantity!==undefined&&e.counted_quantity!==null);
    if(measured.length>1) fail('같은 날짜의 실측 기록이 중복되었습니다.');
    for(const e of events.filter(e=>e.event_type==='실사조정'&&(e.counted_quantity===undefined||e.counted_quantity===null)))balance+=scaled(e.quantity);
    if(measured.length)balance=scaled(measured[0].counted_quantity,'실측수량');
  }
  return balance;
}
export function validateData(data) {
  for(const key of ['menus','materials','suppliers','recipes','price_history','calendar','sales','expenses','opening_inventory','inventory_events','monthly_expense_plan']) if(!Array.isArray(data[key]))fail(`${key} 자료가 없습니다.`);
  if(!data.meta||!isDate(data.meta.start_date)||!isDate(data.meta.as_of))fail('자료 기간 정보가 올바르지 않습니다.');
  const unique=(rows,key)=>{const ids=new Set();for(const r of rows){if(!r[key]||ids.has(r[key]))fail(`${key} 중복 또는 누락`);ids.add(r[key]);}};
  unique(data.sales,'sale_id');unique(data.expenses,'expense_id');unique(data.inventory_events,'event_id');unique(data.menus,'menu_id');unique(data.materials,'material_id');unique(data.suppliers,'supplier_id');unique(data.calendar,'date');
  const menuIds=new Set(data.menus.map(m=>m.menu_id)),matIds=new Set(data.materials.map(m=>m.material_id));
  const combinations=new Set();
  for(const s of data.sales) {
    if(!isDate(s.date)||!menuIds.has(s.menu_id)||!['매장','포장'].includes(s.channel))fail(`${s.sale_id}: 날짜·메뉴·채널 오류`);
    const k=`${s.date}/${s.menu_id}/${s.channel}`;if(combinations.has(k))fail('날짜·메뉴·채널 판매 중복');combinations.add(k);
    saleAmounts(s); usageForSale(data,s);
  }
  for(const r of data.recipes)if(!menuIds.has(r.menu_id)||!matIds.has(r.material_id)||scaled(r.quantity)<0n)fail('레시피 연결 오류');
  for(const p of data.price_history)if(!matIds.has(p.material_id)||!isDate(p.effective_date)||scaled(p.pack_quantity)<=0n||scaled(p.pack_price)<0n)fail('가격이력 오류');
  for(const d of data.calendar)if(!isDate(d.date)||typeof d.record_complete!=='boolean'||typeof d.is_open!=='boolean')fail('영업달력 오류');
  for(const e of data.expenses)if(!isDate(e.date)||!expenseCategories(data).includes(e.category)||scaled(e.amount)<0n)fail(`${e.expense_id}: 비용 오류`);
  for(const e of [...data.opening_inventory,...data.inventory_events]){
    const mat=data.materials.find(m=>m.material_id===e.material_id);
    if(!mat||mat.unit!==e.unit||!isDate(e.date))fail('재고 재료·단위·날짜 오류');scaled(e.quantity);
    if(e.counted_quantity!=null&&scaled(e.counted_quantity)<0n)fail('실측수량 오류');
  }
  return true;
}

export function expenseCategories(data) {return [...new Set(data.monthly_expense_plan.map(e=>e.category))].sort();}
export function buildExpense(data,input,existing=null,today=todayKorea()) {
  checkDate(input.date,data,today);
  if(!expenseCategories(data).includes(input.category)) fail('기존 비용항목을 선택하세요.','category');
  return {...(existing||{}),expense_id:existing?.expense_id||'',date:input.date,category:input.category,
    amount:integer(input.amount,'비용 금액','amount'),recognition:existing?.recognition??'직접 입력'};
}
export function saveExpenseMutation(data,expense,{id='',newId=''}={}) {
  const old=id?data.expenses.find(e=>e.expense_id===id):null;
  if(id&&!old) fail('대상 비용을 찾을 수 없습니다. 최신 자료를 불러오세요.');
  const checked=buildExpense(data,expense,old);
  const next=structuredClone(data),stored={...checked,expense_id:id||newId};
  if(!stored.expense_id||(!id&&next.expenses.some(e=>e.expense_id===newId))) fail('비용ID가 중복되거나 없습니다.');
  if(old)next.expenses[next.expenses.findIndex(e=>e.expense_id===id)]=stored;else next.expenses.push(stored);
  calendarEntry(next,stored.date).record_complete=false;
  if(old)calendarEntry(next,old.date).record_complete=false;
  return next;
}
export function deleteExpenseMutation(data,id) {
  const old=data.expenses.find(e=>e.expense_id===id);if(!old)fail('이미 삭제됐거나 없는 비용 기록입니다.');
  const next=structuredClone(data);next.expenses=next.expenses.filter(e=>e.expense_id!==id);
  calendarEntry(next,old.date).record_complete=false;return next;
}
export function operatingProfit(data,scope) {
  const p=periodInfo(data,scope),dates=new Set(p.completed.map(d=>d.date));
  const sales=aggregate(data,data.sales.filter(s=>inPeriod(s.date,scope))).total;
  const costs=data.expenses.filter(e=>dates.has(e.date)),issues=[...sales.issues];let expenses=0n;
  for(const e of costs)try{const amount=scaled(e.amount,'비용');if(amount<0n)fail('비용이 음수입니다.');expenses+=amount;}catch(err){issues.push(`${e.expense_id}: ${err.message}`);}
  const missing=p.completed.filter(d=>!costs.some(e=>e.date===d.date)).map(d=>d.date);
  return {sales,expenses,profit:sales.contribution-expenses,issues,missing,known:dates.size>0,
    pending:data.expenses.filter(e=>inPeriod(e.date,scope)&&!dates.has(e.date)).length};
}
export function createBackup(state,now=new Date()) {
  if(!state||state.schemaVersion!==1||state.calculationVersion!==1||!Number.isSafeInteger(state.revision))fail('저장자료의 버전·자료판을 확인하세요.');
  validateData(state.data);
  const data=structuredClone(state.data);
  if(!data.settings?.minimum_quantities)fail('최소 수량 설정이 없습니다.');
  const counts=Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k).value;
  return {filename:`prep-cafe-backup_${get('year')}${get('month')}${get('day')}_${get('hour')}${get('minute')}${get('second')}.json`,
    document:{format:'prep-cafe-backup',schemaVersion:1,calculationVersion:1,exportedAt:now.toISOString(),storeIdentity:data.meta.store_name??data.meta.store??'프렙 카페',sourceMeta:structuredClone(data.meta),revision:state.revision,counts,data}};
}
