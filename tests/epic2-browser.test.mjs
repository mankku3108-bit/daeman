import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CAFE_PLAYWRIGHT||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
page.setDefaultTimeout(10000);const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('tests/results',{recursive:true});await mkdir('.test-output',{recursive:true});
const hidden=s=>page.locator(s).waitFor({state:'hidden'});
async function check(name,fn){const start=Date.now();try{await fn();results.push({name,status:'pass',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'fail',error:e.message});throw e;}}
async function state(p=page){return p.evaluate(async()=>{const m=await import('/app/storage.mjs'),db=await m.openDatabase();const s=await m.readState(db);db.close();return s;});}
async function costs(p=page){await p.locator('[data-view="expenses"]').click();}
async function newCost(p=page,amount='1000'){await costs(p);await p.locator('#new-expense').click();await p.locator('#expense-date').fill('2026-09-18');await p.locator('#expense-category').selectOption('소모품·청소비');await p.locator('#expense-amount').fill(amount);}
async function closeDay(date){await page.locator('#open-close').click();await page.locator('#closing-date').fill(date);await page.locator('#confirm-closing').click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirm-ok').click();await hidden('#closing-dialog');}
async function day(date){await page.locator('#mode-day').click();await page.locator('#period-value').fill(date);await page.locator('#period-value').dispatchEvent('change');}
let baseline,id;
try{
 await check('E01 초기 월·일 손익 독립 검산',async()=>{
  await page.goto('http://127.0.0.1:4173');await page.locator('#workspace').waitFor();baseline=await state();await page.locator('[data-view="pnl"]').click();
  assert.match(await page.locator('#pnl-rows').innerText(),/6,414,713/);assert.match(await page.locator('#pnl-rows').innerText(),/3,798,010/);assert.match(await page.locator('#pnl-rows').innerText(),/45.9%/);
  await day('2026-09-18');assert.match(await page.locator('#pnl-rows').innerText(),/278,868/);
 });
 await check('E02 입력 오류·취소는 저장 없이 입력 유지',async()=>{
  await newCost(page,'');await page.locator('#save-expense').click();assert.match(await page.locator('#expense-error').innerText(),/정수/);
  await page.locator('#expense-amount').fill('-1');await page.locator('#save-expense').click();assert.match(await page.locator('#expense-error').innerText(),/정수/);
  await page.locator('#expense-amount').fill('1000');await page.locator('#expense-date').fill('2099-01-01');await page.locator('#save-expense').click();assert.match(await page.locator('#expense-error').innerText(),/미래/);
  await page.locator('#cancel-expense').click();await page.locator('#confirm-ok').click();await hidden('#expense-dialog');assert.deepEqual(await state(),baseline);
 });
 await check('E03 비용 추가·연속 클릭·실제 저장·재접속',async()=>{
  await newCost();await page.evaluate(()=>{document.querySelector('#expense-form').requestSubmit();document.querySelector('#expense-form').requestSubmit();});await hidden('#expense-dialog');
  let s=await state();assert.equal(s.data.expenses.length,3561);id=s.data.expenses.at(-1).expense_id;assert.equal(s.data.calendar.find(d=>d.date==='2026-09-18').record_complete,false);
  for(const k of ['sales','inventory_events','monthly_expense_plan'])assert.deepEqual(s.data[k],baseline.data[k]);
  await page.reload();await page.locator('#workspace').waitFor();await costs();await day('2026-09-18');assert.match(await page.locator('#expense-rows').innerText(),/잠정/);assert.equal((await state()).data.expenses.length,3561);
 });
 await check('E04 재마감 뒤 운영비·손익 반영, 메뉴 공헌이익 보존',async()=>{
  await closeDay('2026-09-18');await page.locator('[data-view="pnl"]').click();assert.match(await page.locator('#pnl-rows').innerText(),/212,000/);
  assert.match(await page.locator('#pnl-rows').innerText(),/277,868/);assert.match(await page.locator('#summary').innerText(),/489,868/);
 });
 await check('E05 금액·날짜 수정 ID 유지, 이전·새 날짜 재마감',async()=>{
  await costs();await page.locator(`[data-expense="edit"][data-id="${id}"]`).click();await page.locator('#expense-amount').fill('2000');await page.locator('#expense-date').fill('2026-09-17');await page.locator('#save-expense').click();await hidden('#expense-dialog');
  const s=await state();assert.equal(s.data.expenses.length,3561);assert.equal(s.data.expenses.find(e=>e.expense_id===id).amount,2000);for(const date of ['2026-09-17','2026-09-18'])assert.equal(s.data.calendar.find(d=>d.date===date).record_complete,false);
  await closeDay('2026-09-17');await closeDay('2026-09-18');await page.locator('[data-view="pnl"]').click();await page.locator('#mode-month').click();assert.match(await page.locator('#pnl-rows').innerText(),/6,412,713/);
 });
 await check('E06 삭제 취소·실제 삭제·재접속·다른 기록 보호',async()=>{
  await costs();await day('2026-09-17');await page.locator(`[data-expense="delete"][data-id="${id}"]`).click();await page.locator('#confirm-cancel').click();assert.equal((await state()).data.expenses.length,3561);
  await page.locator(`[data-expense="delete"][data-id="${id}"]`).click();await page.locator('#confirm-ok').click();await page.locator('#notice').filter({hasText:'비용을 삭제'}).waitFor();
  let s=await state();assert.deepEqual(s.data.expenses,baseline.data.expenses);assert.deepEqual(s.data.sales,baseline.data.sales);assert.deepEqual(s.data.inventory_events,baseline.data.inventory_events);
  await page.reload();await page.locator('#workspace').waitFor();assert.equal((await state()).data.expenses.length,3560);await closeDay('2026-09-17');
 });
 await check('E07 두 탭 충돌·입력 유지·최신 자료 읽기·재시도',async()=>{
  const second=await context.newPage();await second.goto('http://127.0.0.1:4173');await second.locator('#workspace').waitFor();await newCost(second,'0');
  await newCost(page,'0');await page.locator('#save-expense').click();await hidden('#expense-dialog');
  await second.locator('#save-expense').click();await second.locator('#expense-reload').waitFor();assert.match(await second.locator('#expense-error').innerText(),/다른 탭/);assert.equal(await second.locator('#expense-amount').inputValue(),'0');assert.equal((await state()).data.expenses.length,3561);
  await second.locator('#expense-reload').click();await second.locator('#save-expense').click();await second.locator('#expense-dialog').waitFor({state:'hidden'});assert.equal((await state()).data.expenses.length,3562);await second.close();await page.locator('#reload-data').click();await closeDay('2026-09-18');
 });
 await check('E08 실제 거래 중단 시 기존 자료·입력 보호',async()=>{
  const before=await state();await newCost(page,'4321');
  await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const req=window.originalPut.apply(this,args);if(this.name==='appState')req.addEventListener('success',()=>this.transaction.abort());return req;};});
  await page.locator('#save-expense').click();await page.locator('#expense-error').filter({hasText:'저장에 실패'}).waitFor();assert.equal(await page.locator('#expense-amount').inputValue(),'4321');assert.deepEqual(await state(),before);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});await page.locator('#cancel-expense').click();await page.locator('#confirm-ok').click();await hidden('#expense-dialog');
 });
 await check('E09 실제 JSON 내려받기·전체 저장자료 일치·버전·건수',async()=>{
  await page.locator('[data-view="backup"]').click();const saved=await state(),downloadPromise=page.waitForEvent('download');await page.locator('#download-backup').click();const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/^prep-cafe-backup_\d{8}_\d{6}\.json$/);const decoded=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(decoded.data,saved.data);assert.equal(decoded.counts.expenses,3562);assert.equal(decoded.schemaVersion,1);assert.equal(decoded.calculationVersion,1);assert.equal(decoded.revision,saved.revision);assert.equal(decoded.storeIdentity,'프렙 카페');assert.deepEqual(await state(),saved);
  assert.match(await page.locator('#backup-status').innerText(),/내려받기 시작/);
 });
 await check('E10 백업 읽기 실패 처리, 자료 덮어쓰기 없음',async()=>{
  const before=await state();await page.evaluate(()=>{window.originalGet=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(){throw new Error('검사용 읽기 실패');};});
  await page.locator('#download-backup').click();await page.locator('#backup-status').filter({hasText:'백업 생성 실패'}).waitFor();await page.evaluate(()=>{IDBObjectStore.prototype.get=window.originalGet;});assert.deepEqual(await state(),before);
 });
 await check('E11 비용 미입력과 실제 0 구분, 매출 없는 비용 적자',async()=>{
  await day('2026-09-19');await closeDay('2026-09-19');await page.locator('[data-view="pnl"]').click();assert.match(await page.locator('#pnl-status').innerText(),/비용 미입력 1일/);assert.match(await page.locator('#pnl-rows').innerText(),/판정 보류/);
  await newCost(page,'0');await page.locator('#expense-date').fill('2026-09-19');await page.locator('#save-expense').click();await hidden('#expense-dialog');await closeDay('2026-09-19');await page.locator('[data-view="pnl"]').click();assert.doesNotMatch(await page.locator('#pnl-status').innerText(),/비용 미입력/);
  await newCost(page,'1000');await page.locator('#expense-date').fill('2026-09-19');await page.locator('#save-expense').click();await hidden('#expense-dialog');await closeDay('2026-09-19');await page.locator('[data-view="pnl"]').click();assert.match(await page.locator('#pnl-rows').innerText(),/-1,000/);assert.match(await page.locator('#pnl-rows').innerText(),/손익률\s+—/);
 });
 await check('E12 모바일 화면·비용 입력창·렌더 오류',async()=>{
  await page.setViewportSize({width:390,height:844});await costs();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#new-expense').click();assert.equal(await page.locator('#save-expense').isVisible(),true);await page.screenshot({path:'.test-output/epic2-mobile.png',fullPage:true});await page.locator('#cancel-expense').click();await hidden('#expense-dialog');assert.deepEqual(errors,[]);
 });
}catch(e){process.exitCode=1;console.error(e.stack);await page.screenshot({path:'.test-output/epic2-failure.png',fullPage:true}).catch(()=>{});}
finally{await writeFile('tests/results/epic2-browser.json',JSON.stringify({browser:'Microsoft Edge',version:browser.version(),results,consoleErrors:errors},null,2));await context.close();await browser.close();}
