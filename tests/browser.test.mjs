import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.CAFE_PLAYWRIGHT||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(10000);
const failures=[],results=[],logs=[];
page.on('pageerror',e=>logs.push(e.message));
await mkdir('.test-output',{recursive:true});
async function check(name,fn){const start=Date.now();try{const detail=await fn();results.push({name,status:'pass',ms:Date.now()-start,detail});console.log('PASS',name,detail?JSON.stringify(detail):'');}catch(e){results.push({name,status:'fail',error:e.message});failures.push(name);console.error('FAIL',name,e.message);await page.screenshot({path:'.test-output/browser-failure.png',fullPage:true}).catch(()=>{});throw e;}}
const hidden=selector=>page.locator(selector).waitFor({state:'hidden'});
const visible=selector=>page.locator(selector).waitFor({state:'visible'});
async function appState(p=page){return p.evaluate(async()=>{const m=await import('/app/storage.mjs');const db=await m.openDatabase();const s=await m.readState(db);db.close();return s;});}
async function openNew(p=page){await p.locator('#new-sale').click();await p.locator('#sale-date').fill('2026-09-19');await p.locator('#sale-menu').selectOption('M02');await p.locator('#sale-quantity').fill('10');await p.locator('#sale-price').fill('4800');await p.locator('#sale-discount').fill('0');await p.locator('#sale-fee').fill('720');}
async function markDay(){await page.locator('#open-close').click();await page.locator('#closing-date').fill('2026-09-19');await page.locator('#confirm-closing').click();await hidden('#closing-dialog');}
try{
 await check('B01 실제 초기 반영·완료 기간·화면 합계',async()=>{
  const begin=Date.now();await page.goto('http://127.0.0.1:4173');await visible('#workspace');const startup=Date.now()-begin;
  assert.match(await page.locator('#summary').innerText(),/13,968,930/);assert.match(await page.locator('#summary').innerText(),/10,212,723/);
  assert.match(await page.locator('#completed-label').innerText(),/2026-09-18/);assert.equal(await page.locator('#profit-rows tr').count(),16);
  assert.equal((await appState()).data.sales.length,6112);await page.screenshot({path:'.test-output/dashboard.png',fullPage:true});
  return {startupMs:startup,net:13968930,contributionDisplay:10212723};
 });
 await check('B02 실제 IndexedDB: 최초 반영 한 번·거래 중단·자료판 충돌·원본 보존',async()=>{
  const r=await page.evaluate(async()=>{
   const m=await import('/app/storage.mjs');const name='prep-cafe-isolated-storage-test';const db=await m.openDatabase(indexedDB,name);let loads=0;
   const load=async()=>{loads++;return (await fetch('/data/initial.json')).json();};
   const a=await m.initialize(db,load);const b=await m.initialize(db,load);
   const changed=structuredClone(a.data);changed.meta.store_name='검사용 복사자료';let aborted=false;
   try{await m.commitState(db,changed,a.revision,{abortAfterPut:true});}catch{aborted=true;}
   const afterAbort=await m.readState(db);const committed=await m.commitState(db,changed,a.revision);let conflict=false;
   try{await m.commitState(db,a.data,a.revision);}catch(e){conflict=e.name==='ConflictError';}
   const afterConflict=await m.readState(db);db.close();
   return {loads,firstRevision:a.revision,secondRevision:b.revision,aborted,abortKeptOld:afterAbort.data.meta.store_name===a.data.meta.store_name,conflict,conflictKeptNew:afterConflict.revision===committed.revision};
  });
  assert.deepEqual(r,{loads:1,firstRevision:0,secondRevision:0,aborted:true,abortKeptOld:true,conflict:true,conflictKeptNew:true});return r;
 });
 await check('B03 입력 미리보기·과다 할인 차단·취소 시 저장 없음',async()=>{
  await openNew();assert.match(await page.locator('#preview-grid').innerText(),/36,048/);assert.match(await page.locator('#usage-preview').innerText(),/2000 ml/);
  await page.locator('#sale-discount').fill('48001');await page.locator('#save-sale').click();assert.match(await page.locator('#sale-error').innerText(),/클 수 없습니다/);assert.equal((await appState()).data.sales.length,6112);
  await page.locator('#cancel-sale').click();await page.locator('#confirm-ok').click();await hidden('#sale-dialog');assert.equal((await appState()).data.sales.length,6112);
 });
 let id;
 await check('B04 판매 실제 저장·잠정 구분·재접속·중복 클릭',async()=>{
  await openNew();await page.evaluate(()=>{document.getElementById('sale-form').requestSubmit();document.getElementById('sale-form').requestSubmit();});await hidden('#sale-dialog');
  let s=await appState();assert.equal(s.data.sales.length,6113);id=s.data.sales.find(x=>x.date==='2026-09-19'&&x.menu_id==='M02').sale_id;
  assert.equal(s.data.calendar.find(x=>x.date==='2026-09-19').record_complete,false);assert.match(await page.locator('#sales-rows').innerText(),/잠정/);
  await page.reload();await visible('#workspace');s=await appState();assert.equal(s.data.sales.length,6113);
  await page.locator('[data-view="sales"]').click();await page.locator('#mode-day').click();await page.locator('#period-value').fill('2026-09-19');await page.locator('#period-value').dispatchEvent('change');
  assert.match(await page.locator('#sales-rows').innerText(),/카페라떼/);return {saleId:id};
 });
 await check('B05 같은 날짜·메뉴·채널 중복 저장 차단',async()=>{
  await openNew();await page.locator('#save-sale').click();assert.match(await page.locator('#sale-error').innerText(),/기존 집계행/);assert.equal((await appState()).data.sales.length,6113);
  await page.locator('#cancel-sale').click();await page.locator('#confirm-ok').click();await hidden('#sale-dialog');
 });
 await check('B06 실제 마감과 메뉴 수익성 연결',async()=>{
  await markDay();await page.locator('[data-view="profit"]').click();assert.match(await page.locator('#summary').innerText(),/36,048/);assert.match(await page.locator('#summary').innerText(),/48,000/);
  const row=page.locator('#profit-rows tr').filter({hasText:'M02'}).filter({hasText:'매장'});assert.match(await row.innerText(),/36,048/);
 });
 await check('B07 채널·수량 수정과 ID 유지·재마감',async()=>{
  await page.locator('[data-view="sales"]').click();await page.locator(`[data-action="edit"][data-id="${id}"]`).click();
  await page.locator('input[name="channel"][value="포장"]').check();await page.locator('#sale-quantity').fill('12');
  assert.match(await page.locator('#preview-grid').innerText(),/41,405/);assert.match(await page.locator('#usage-preview').innerText(),/포장컵세트/);
  await page.locator('#save-sale').click();await hidden('#sale-dialog');const s=await appState();
  const record=s.data.sales.find(x=>x.sale_id===id);assert.equal(record.quantity,12);assert.equal(record.channel,'포장');assert.equal(record.unit_packaging_cost_snapshot,166.4);
  assert.equal(s.data.calendar.find(x=>x.date==='2026-09-19').record_complete,false);assert.equal(s.data.sales.length,6113);
  await markDay();assert.match(await page.locator('#summary').innerText(),/41,405/);
 });
 await check('B08 실제 두 탭 충돌·입력 유지·창 안에서 최신 자료 읽기',async()=>{
  const second=await context.newPage();await second.goto('http://127.0.0.1:4173');await second.locator('#workspace').waitFor();await openNew(second);
  await second.locator('#sale-date').fill('2026-09-20');
  await page.locator('[data-view="sales"]').click();await page.locator(`[data-action="edit"][data-id="${id}"]`).click();await page.locator('#sale-discount').fill('100');await page.locator('#save-sale').click();await hidden('#sale-dialog');
  await second.locator('#save-sale').click();await second.locator('#form-reload').waitFor();assert.match(await second.locator('#sale-error').innerText(),/다른 탭/);assert.equal(await second.locator('#sale-quantity').inputValue(),'10');
  assert.equal((await appState()).data.sales.some(s=>s.date==='2026-09-20'),false);
  await second.locator('#form-reload').click();await second.locator('#form-reload').waitFor({state:'hidden'});assert.equal(await second.locator('#sale-quantity').inputValue(),'10');assert.match(await second.locator('#sale-error').innerText(),/입력값은 유지/);await second.close();
 });
 await check('B09 삭제 취소·실제 삭제·재접속·비용/실측 보호',async()=>{
  const before=await appState();await page.locator(`[data-action="delete"][data-id="${id}"]`).click();await page.locator('#confirm-cancel').click();assert.equal((await appState()).data.sales.length,6113);
  await page.locator(`[data-action="delete"][data-id="${id}"]`).click();await page.locator('#confirm-ok').click();await page.locator('#sales-rows .empty').waitFor();
  let after=await appState();assert.equal(after.data.sales.length,6112);assert.deepEqual(after.data.expenses,before.data.expenses);assert.deepEqual(after.data.inventory_events,before.data.inventory_events);
  await page.reload();await visible('#workspace');after=await appState();assert.equal(after.data.sales.length,6112);
 });
 await check('B10 판매 0 확인·미래 마감 차단',async()=>{
  await page.locator('#open-close').click();await page.locator('#closing-date').fill('2099-01-01');await page.locator('#confirm-closing').click();assert.match(await page.locator('#closing-error').innerText(),/미래/);
  await page.locator('#closing-date').fill('2026-09-20');await page.locator('#confirm-closing').click();await page.locator('#confirm-message').waitFor();assert.match(await page.locator('#confirm-message').innerText(),/실제 판매가 0/);await page.locator('#confirm-cancel').click();await page.locator('#cancel-closing').click();
  assert.equal((await appState()).data.calendar.find(x=>x.date==='2026-09-20').record_complete,false);
 });
 await check('B11 휴무일 전환 확인·취소 보호',async()=>{
  await openNew();await page.locator('#sale-date').fill('2026-09-21');await page.locator('#save-sale').click();await visible('#confirm-dialog');assert.match(await page.locator('#confirm-message').innerText(),/휴무일/);
  await page.locator('#confirm-cancel').click();assert.equal((await appState()).data.sales.length,6112);
  await page.locator('#cancel-sale').click();await page.locator('#confirm-ok').click();await hidden('#sale-dialog');
 });
 await check('B12 재료 부족 경고·실제 저장 후 사용자 입력 보존',async()=>{
  await openNew();await page.locator('#sale-quantity').fill('100000');await page.locator('#save-sale').click();await hidden('#sale-dialog');
  assert.match(await page.locator('#notice').innerText(),/잔량 음수/);const s=await appState();assert.equal(s.data.sales.length,6113);
  const shortageId=s.data.sales.find(x=>x.date==='2026-09-19'&&x.menu_id==='M02').sale_id;
  await page.locator(`[data-action="delete"][data-id="${shortageId}"]`).click();await page.locator('#confirm-ok').click();await page.locator('#sales-rows .empty').waitFor();
 });
 await check('B13 모바일 화면·입력창과 렌더 오류',async()=>{
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="dashboard"]').click();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);await page.screenshot({path:'.test-output/mobile.png',fullPage:true});
  await openNew();await page.screenshot({path:'.test-output/sale-dialog-mobile.png',fullPage:true});assert.equal(await page.locator('#save-sale').isVisible(),true);
  await page.locator('#cancel-sale').click();await page.locator('#confirm-ok').click();await hidden('#sale-dialog');assert.deepEqual(logs,[]);
 });
 await check('B14 원본 문서·파일 노출 방지',async()=>{
  for(const url of ['/docs/01_PRD.md','/data/매장운영데이터.xlsx','/app/../docs/03_TRD.md'])assert.equal((await context.request.get('http://127.0.0.1:4173'+url)).status(),404);
 });
}catch(error){process.exitCode=1;console.error(error.stack);}
finally{await writeFile('.test-output/browser-results.json',JSON.stringify({browser:'Microsoft Edge',version:browser.version(),results,failures,consoleErrors:logs},null,2));await context.close();await browser.close();}
