import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildExpense,saveExpenseMutation,deleteExpenseMutation,operatingProfit,closeDayMutation,createBackup,money,scaled,percent,validateData} from '../app/core.mjs';
const source=JSON.parse(await readFile(new URL('../data/매장운영데이터.json',import.meta.url),'utf8'));
source.settings={minimum_quantities:{}};
const scope={mode:'month',value:'2026-09'};
const input=(extra={})=>({date:'2026-09-18',category:'소모품·청소비',amount:'1000',...extra});
test('9월 원기록 독립 검산: 운영비 3798010, 손익 6414712.72',()=>{
  const p=operatingProfit(source,scope);assert.equal(p.expenses,scaled('3798010'));assert.equal(p.profit,scaled('6414712.72'));assert.equal(money(p.profit),'6,414,713');assert.equal(percent(p.profit,p.sales.net),'45.9%');assert.deepEqual(p.missing,[]);
  assert.equal(operatingProfit(source,{mode:'day',value:'2026-09-18'}).profit,scaled('278868.32'));
});
for(const [name,extra] of [['공란',{amount:''}],['음수',{amount:'-1'}],['소수',{amount:'0.5'}],['초과',{amount:'9007199254740992'}],['미래',{date:'2099-01-01'}],['기준일 전',{date:'2025-06-30'}],['없는 날짜',{date:'2026-02-30'}],['새 항목',{category:'기타'}]])test(`비용 오류 차단: ${name}`,()=>assert.throws(()=>buildExpense(source,input(extra),null,'2026-10-12')));
test('0원·동일 날짜 항목 여러 행 허용, ID 충돌 차단',()=>{
  const e=buildExpense(source,input({amount:'0'}));const d=saveExpenseMutation(source,e,{newId:'test'});
  assert.equal(d.expenses.at(-1).amount,0);assert.equal(d.expenses.length,3561);assert.throws(()=>saveExpenseMutation(d,e,{newId:'test'}));assert.equal(source.expenses.length,3560);
});
test('비용 추가와 재마감: 메뉴 기여액 보존, 비용만 차감',()=>{
  const d=saveExpenseMutation(source,buildExpense(source,input()),{newId:'test'});assert.equal(d.calendar.find(x=>x.date==='2026-09-18').record_complete,false);
  const closed=closeDayMutation(d,'2026-09-18'),p=operatingProfit(closed,scope);
  assert.equal(p.profit,scaled('6413712.72'));assert.equal(p.sales.contribution,scaled('10212722.72'));
  for(const key of ['sales','inventory_events','monthly_expense_plan','recipes'])assert.deepEqual(d[key],source[key]);
});
test('수정 ID·기존 배분 설명·확장 필드 보존, 날짜 이동 양쪽 미완료',()=>{
  const d=structuredClone(source),old=d.expenses[0];old.optional='preserve';
  const edited=buildExpense(d,input({date:'2026-09-18',amount:'3000'}),old);
  const next=saveExpenseMutation(d,edited,{id:old.expense_id});
  assert.equal(next.expenses.length,3560);assert.equal(next.expenses[0].expense_id,old.expense_id);assert.equal(next.expenses[0].recognition,old.recognition);assert.equal(next.expenses[0].optional,'preserve');
  for(const date of [old.date,edited.date])assert.equal(next.calendar.find(x=>x.date===date).record_complete,false);
  assert.deepEqual(next.monthly_expense_plan,d.monthly_expense_plan);
});
test('삭제 지정한 비용만 제거·다른 자료 보존·반복 삭제 차단',()=>{
  const id=source.expenses[0].expense_id,next=deleteExpenseMutation(source,id);assert.equal(next.expenses.length,3559);assert.deepEqual(next.expenses,source.expenses.slice(1));
  assert.throws(()=>deleteExpenseMutation(next,id));assert.throws(()=>saveExpenseMutation(next,source.expenses[0],{id}));
  for(const key of ['sales','inventory_events','monthly_expense_plan'])assert.deepEqual(next[key],source[key]);
});
test('휴무일 비용도 완료 손익에 포함하며 영업상태 유지',()=>{
  const d=structuredClone(source),day=d.calendar.find(x=>x.date==='2026-09-18');day.is_open=false;
  const next=saveExpenseMutation(d,buildExpense(d,input()),{newId:'holiday'});assert.equal(next.calendar.find(x=>x.date===day.date).is_open,false);
  assert.equal(operatingProfit(closeDayMutation(next,day.date),scope).profit,scaled('6413712.72'));
});
test('미마감 제외·비용 미입력 구분·매출 0 적자·손익률 공란',()=>{
  const d=structuredClone(source);d.sales=[];d.expenses=[];d.calendar=[{date:'2026-09-18',record_complete:true,is_open:false}];
  assert.deepEqual(operatingProfit(d,scope).missing,['2026-09-18']);
  d.expenses=[{expense_id:'zero',date:'2026-09-18',category:'임차료',amount:1000}];
  const p=operatingProfit(d,scope);assert.equal(p.profit,scaled('-1000'));assert.equal(percent(p.profit,p.sales.net),'—');assert.deepEqual(p.missing,[]);
  d.calendar[0].record_complete=false;assert.equal(operatingProfit(d,scope).known,false);assert.equal(operatingProfit(d,scope).pending,1);
});
test('누락 원가·누락 금액·음수 비용은 계산 오류',()=>{
  for(const value of [null,'',-1]){const d=structuredClone(source);d.expenses.find(e=>e.date==='2026-09-18').amount=value;assert.ok(operatingProfit(d,scope).issues.length);assert.throws(()=>validateData(d));}
  const d=structuredClone(source);d.sales.find(s=>s.date==='2026-09-18').unit_food_cost_snapshot=null;assert.ok(operatingProfit(d,scope).issues.length);
});
test('백업 전체 원기록·설정·선택 필드·한국 시각·버전·건수 보존',()=>{
  const state={schemaVersion:1,calculationVersion:1,revision:4,data:source};
  const backup=createBackup(state,new Date('2026-10-12T00:01:02Z'));
  assert.equal(backup.filename,'prep-cafe-backup_20261012_090102.json');assert.equal(backup.document.format,'prep-cafe-backup');assert.equal(backup.document.counts.expenses,3560);assert.equal(backup.document.counts.sales,6112);
  const decoded=JSON.parse(JSON.stringify(backup.document));assert.deepEqual(decoded.data,source);assert.deepEqual(decoded.sourceMeta,source.meta);assert.notEqual(backup.document.data,source);
  assert.throws(()=>createBackup({...state,schemaVersion:2}));assert.throws(()=>createBackup(null));
});
