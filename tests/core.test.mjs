import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scaled,decimal,money,roundDiv,percent,isDate,recipeCost,buildSale,saleAmounts,usageForSale,
  saveSaleMutation,deleteSaleMutation,closeDayMutation,aggregate,inventoryAt,validateData,filteredSales,periodInfo} from '../app/core.mjs';
const source=JSON.parse(await readFile(new URL('../data/매장운영데이터.json',import.meta.url),'utf8'));
const TODAY='2026-10-12';
function fixture(){const d=structuredClone(source);d.sales=[];d.inventory_events=[];d.expenses=[];d.calendar=[{date:'2025-07-01',is_open:true,record_complete:true},{date:'2026-09-19',is_open:true,record_complete:false}];return d;}
const input=(extra={})=>({date:'2026-09-19',menu_id:'M02',channel:'매장',quantity:'10',unit_price:'4800',discount_amount:'0',payment_fee:'720',...extra});
const build=(d,extra={},old=null)=>buildSale(d,input(extra),old,TODAY);
const add=(d,sale,id='test-sale')=>saveSaleMutation(d,sale,{newId:id});
test('실제 초기 자료 전체 검증, 기록 수와 원본 보존',()=>{
  assert.equal(validateData(source),true);assert.equal(source.sales.length,6112);assert.equal(source.menus.length,8);
  const before=JSON.stringify(source);const next=add(source,build(source));assert.equal(next.sales.length,6113);assert.equal(JSON.stringify(source),before);
});
test('정확한 소수와 양수·음수 절반 반올림',()=>{
  assert.equal(scaled('1040.1250'),1040125000n);assert.equal(decimal(scaled('-0.000001')),'-0.000001');
  assert.equal(money(scaled('2.5')),'3');assert.equal(money(scaled('-2.5')),'-3');assert.equal(roundDiv(4n,3n),1n);
  assert.throws(()=>scaled(''));assert.throws(()=>scaled(Infinity));assert.throws(()=>scaled('0.0000001'));assert.equal(percent(0n,0n),'—');
});
test('판매 날짜의 가격이력: 7월 라떼와 9월 라떼',()=>{
  const menu=source.menus.find(m=>m.menu_id==='M02');
  assert.equal(recipeCost(source,menu,'2025-07-01','매장').food,scaled(1040));
  assert.equal(recipeCost(source,menu,'2026-09-19','매장').food,scaled('1123.2'));
  assert.equal(recipeCost(source,menu,'2026-09-19','포장').packaging,scaled('166.4'));
});
test('가격을 재료별로 먼저 반올림하지 않고 개당 합계 후 4자리 원가 고정',()=>{
  const d=fixture();d.price_history=d.price_history.filter(p=>p.material_id!=='I01'&&p.material_id!=='I02');
  d.price_history.push({material_id:'I01',effective_date:'2025-07-01',pack_price:1,pack_quantity:3},{material_id:'I02',effective_date:'2025-07-01',pack_price:1,pack_quantity:3});
  assert.equal(recipeCost(d,d.menus.find(m=>m.menu_id==='M02'),'2025-07-01','매장').food,scaled('73.3333'));
});
test('7월 설명 사례 독립 기대값과 사용량',()=>{
  const d=fixture();const s=build(d,{date:'2025-07-01'});const a=saleAmounts(s);
  assert.equal(a.net,scaled(48000));assert.equal(a.food,scaled(10400));assert.equal(a.fee,scaled(720));assert.equal(a.contribution,scaled(36880));
  assert.deepEqual(usageForSale(d,s).map(u=>[u.material_id,decimal(u.quantity),u.unit]),[['I01','200','g'],['I02','2000','ml']]);
});
test('9월 매장·포장의 금액과 포장 재료',()=>{
  const d=fixture(),hall=build(d),takeout=build(d,{channel:'포장'});
  assert.equal(saleAmounts(hall).contribution,scaled(36048));assert.equal(saleAmounts(takeout).contribution,scaled(34384));
  assert.equal(usageForSale(d,takeout).find(u=>u.material_id==='I10').quantity,scaled(10));
  assert.equal(usageForSale(d,hall).some(u=>u.material_id==='I10'),false);
});
for(const [name,values] of [
  ['미래 날짜',{date:'2026-10-13'}],['초기재고 전 날짜',{date:'2025-06-30'}],['없는 날짜',{date:'2026-02-30'}],
  ['없는 메뉴',{menu_id:'M99'}],['미지원 채널',{channel:'배달'}],['수량 0',{quantity:'0'}],['수량 소수',{quantity:'1.5'}],
  ['수량 음수',{quantity:'-2'}],['금액 빈칸',{unit_price:''}],['할인 초과',{discount_amount:'48001'}],
  ['수수료 빈칸',{payment_fee:''}],['수수료 음수',{payment_fee:'-1'}],['수수료 소수',{payment_fee:'0.5'}],
  ['숫자 이외',{quantity:'NaN'}],['안전 숫자 범위 초과',{quantity:'9007199254740992'}]
])test(`입력 오류 차단: ${name}`,()=>assert.throws(()=>build(fixture(),values)));
test('무료·전액 할인·수수료 0 허용, 손실을 숨기지 않음',()=>{
  const a=saleAmounts(build(fixture(),{unit_price:'0',payment_fee:'0'}));assert.equal(a.net,0n);assert.equal(a.contribution,scaled(-11232));
  assert.equal(saleAmounts(build(fixture(),{discount_amount:'48000',payment_fee:'0'})).net,0n);
});
test('가격·레시피·구매용량·단위 누락 차단',()=>{
  let d=fixture();d.price_history=d.price_history.filter(p=>p.material_id!=='I02');assert.throws(()=>build(d),/가격이력/);
  d=fixture();d.recipes=[];assert.throws(()=>build(d),/레시피/);
  d=fixture();d.price_history.find(p=>p.material_id==='I02'&&p.effective_date==='2026-09-01').pack_quantity=0;assert.throws(()=>build(d),/구매용량/);
  d=fixture();d.recipes.find(r=>r.menu_id==='M02'&&r.material_id==='I02').unit='g';assert.throws(()=>build(d),/단위/);
});
test('추가 후 잠정, 중복 추가·ID 충돌 차단, 원본은 그대로',()=>{
  const d=fixture();const n=add(d,build(d));assert.equal(d.sales.length,0);assert.equal(n.sales.length,1);assert.equal(n.calendar.find(x=>x.date==='2026-09-19').record_complete,false);
  assert.throws(()=>add(n,build(n),'other'),/기존 집계행/);
  assert.throws(()=>add(n,build(n,{channel:'포장'})),/판매ID/);
  assert.equal(aggregate(n,n.sales).total.contribution,0n);assert.equal(aggregate(n,n.sales).pending,1);
});
test('실제 마감 후 실적, 같은 날 반복 마감 중복 없음',()=>{
  const n=add(fixture(),build(fixture()));const done=closeDayMutation(n,'2026-09-19',{today:TODAY});
  assert.equal(aggregate(done,done.sales).total.contribution,scaled(36048));
  assert.equal(closeDayMutation(done,'2026-09-19',{today:TODAY}).calendar.length,done.calendar.length);
});
test('수량 수정 시 ID와 당시 원가 유지, 재마감 필요',()=>{
  const d=closeDayMutation(add(fixture(),build(fixture())),'2026-09-19',{today:TODAY});const old=d.sales[0];
  d.price_history.find(p=>p.material_id==='I02'&&p.effective_date==='2026-09-01').pack_price=9999;
  const updated=build(d,{quantity:'20'},old);const n=saveSaleMutation(d,updated,{id:old.sale_id});
  assert.equal(updated.unit_food_cost_snapshot,1123.2);assert.equal(n.sales[0].sale_id,old.sale_id);assert.equal(n.sales.length,1);
  assert.equal(n.calendar.find(x=>x.date===old.date).record_complete,false);assert.equal(saleAmounts(updated).food,scaled(22464));
});
test('메뉴·채널·날짜 수정 시 기준 재산정과 이전·새 날짜 미완료',()=>{
  const d=closeDayMutation(add(fixture(),build(fixture())),'2026-09-19',{today:TODAY});
  const n=saveSaleMutation(d,build(d,{date:'2025-07-01',channel:'포장'},d.sales[0]),{id:d.sales[0].sale_id});
  assert.equal(n.sales[0].unit_food_cost_snapshot,1040);assert.equal(n.sales[0].unit_packaging_cost_snapshot,160);
  assert.equal(n.calendar.filter(x=>x.record_complete).length,0);
});
test('수정 충돌과 이미 사라진 기록 차단',()=>{
  const d=fixture();let n=add(d,build(d));n=add(n,build(n,{channel:'포장'}),'other');
  assert.throws(()=>saveSaleMutation(n,build(n,{channel:'포장'},n.sales[0]),{id:'test-sale'}),/기존 집계행/);
  assert.throws(()=>saveSaleMutation(n,build(n),{id:'missing'}),/대상 판매/);
});
test('판매 삭제는 판매만 제거, 재고 사용 되돌림·반복 삭제 차단',()=>{
  const d=fixture();d.expenses=structuredClone(source.expenses.slice(0,1));const n=add(d,build(d));
  assert.equal(inventoryAt(n,'2026-09-19','I02'),scaled(34000));const deleted=deleteSaleMutation(n,'test-sale');
  assert.equal(deleted.sales.length,0);assert.deepEqual(deleted.expenses,d.expenses);assert.equal(inventoryAt(deleted,'2026-09-19','I02'),scaled(36000));
  assert.throws(()=>deleteSaleMutation(deleted,'test-sale'),/이미 삭제/);
});
test('휴무일 판매 확인, 달력 없는 유효 날짜 추가',()=>{
  const d=fixture();d.calendar[1].is_open=false;assert.throws(()=>add(d,build(d)),/휴무일/);
  const n=saveSaleMutation(d,build(d),{newId:'test',confirmOpen:true});assert.equal(n.calendar[1].is_open,true);
  const m=add(d,build(d,{date:'2026-09-20'}));assert.equal(m.calendar.find(x=>x.date==='2026-09-20').weather,'');
});
test('마감 날짜·판매 0 확인·순매출 오류 차단',()=>{
  const d=fixture();assert.throws(()=>closeDayMutation(d,'2026-10-13',{confirmZero:true,today:TODAY}),/미래/);
  assert.throws(()=>closeDayMutation(d,'2026-09-19',{today:TODAY}),/실제 판매가 0/);
  assert.equal(closeDayMutation(d,'2026-09-19',{confirmZero:true,today:TODAY}).calendar[1].record_complete,true);
  const n=add(d,build(d));n.sales[0].net_sales=1;assert.throws(()=>closeDayMutation(n,'2026-09-19',{today:TODAY}),/일치/);
});
test('실측과 조정 이중 차감 방지, 실측 이전 판매 수정은 실측 보호',()=>{
  const d=fixture();d.inventory_events=[{event_id:'measure',date:'2026-09-19',material_id:'I02',event_type:'실사조정',quantity:-200,unit:'ml',counted_quantity:4000}];
  let n=add(d,build(d));assert.equal(inventoryAt(n,'2026-09-19','I02'),scaled(4000));
  n=saveSaleMutation(n,build(n,{quantity:'20'},n.sales[0]),{id:n.sales[0].sale_id});
  assert.equal(inventoryAt(n,'2026-09-19','I02'),scaled(4000));assert.equal(n.inventory_events[0].quantity,-200);
  n=add(n,build(n,{date:'2026-09-20'}),'later');assert.equal(inventoryAt(n,'2026-09-20','I02'),scaled(2000));
});
test('실측 0 유지, 재고 부족은 실제 음수 그대로',()=>{
  const d=fixture();d.inventory_events=[{event_id:'measure',date:'2026-09-19',material_id:'I02',event_type:'실사조정',quantity:-36000,unit:'ml',counted_quantity:0}];
  assert.equal(inventoryAt(d,'2026-09-19','I02'),0n);
  const n=add(d,build(d,{date:'2026-09-20'}));assert.equal(inventoryAt(n,'2026-09-20','I02'),scaled(-2000));
});
test('메뉴 비율은 금액 합계, 미마감·채널 중복 없음',()=>{
  let d=fixture();d=add(d,build(d));d=add(d,build(d,{channel:'포장',payment_fee:'0'}),'other');
  const closed=closeDayMutation(d,'2026-09-19',{today:TODAY});const a=aggregate(closed,closed.sales);
  assert.equal(a.total.net,scaled(96000));assert.equal(a.total.contribution,scaled(71152));assert.equal(a.total.count,2);assert.equal(a.rows.length,16);
  assert.equal(percent(a.total.contribution,a.total.net),'74.1%');
});
test('검색·기간과 필터된 전체 결과',()=>{
  assert.equal(filteredSales(source,{mode:'month',value:'2026-09'},{menu:'M02',channel:'포장'}).every(s=>s.menu_id==='M02'&&s.channel==='포장'),true);
  assert.equal(filteredSales(source,{mode:'day',value:'2026-09-18'},{query:'없는 검색어'}).length,0);
  const p=periodInfo(source,{mode:'month',value:'2026-09'});assert.equal(p.last,'2026-09-18');assert.equal(p.pending.length,12);
  assert.equal(isDate('2026-02-30'),false);
});
test('정상 합계처럼 숨기지 않는 누락 원가',()=>{
  const d=fixture();d.sales=[{...build(d,{date:'2025-07-01'}),sale_id:'bad',unit_food_cost_snapshot:null}];
  assert.equal(aggregate(d,d.sales).total.issues.length,1);assert.throws(()=>validateData(d),/원가/);
});
