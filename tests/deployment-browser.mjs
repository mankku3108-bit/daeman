import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSite,output,publicFiles} from '../build.mjs';

await buildSite();
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const {chromium}=await import(pathToFileURL(process.env.CAFE_PLAYWRIGHT||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const files=new Set(publicFiles.keys());
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!files.has(file)){res.writeHead(404);res.end('Not found');return;}
  const headers=Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
  headers['Content-Type']=types[path.extname(file)];
  res.writeHead(200,headers);res.end(await readFile(path.join(output,file)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,url=`http://127.0.0.1:${port}`;
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
async function check(name,fn){try{await fn();results.push({name,status:'pass'});console.log('PASS',name);}catch(e){results.push({name,status:'fail',error:e.message});throw e;}}
try{
  await check('D01 공개 도메인 Host에서도 정적 화면 정상 제공',async()=>{
    const result=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:'/',headers:{Host:'daeman.vercel.app'}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
    assert.equal(result.status,200);assert.match(result.body,/프렙 카페/);assert.doesNotMatch(result.body,/^Forbidden$/);
  });
  await check('D02 배포 파일로 부팅·모듈·초기 JSON·손익 표시',async()=>{
    const response=await page.goto(url);assert.equal(response.status(),200);await page.locator('#workspace').waitFor();
    await page.locator('[data-view="pnl"]').click();assert.match(await page.locator('#pnl-rows').innerText(),/6,414,713/);assert.match(await page.locator('#pnl-rows').innerText(),/3,798,010/);assert.deepEqual(errors,[]);
  });
  await check('D03 배포 화면 비용 저장·새로고침·백업 실제 내려받기',async()=>{
    await page.locator('[data-view="expenses"]').click();await page.locator('#new-expense').click();await page.locator('#expense-date').fill('2026-09-19');await page.locator('#expense-category').selectOption('소모품·청소비');await page.locator('#expense-amount').fill('1000');await page.locator('#save-expense').click();await page.locator('#expense-dialog').waitFor({state:'hidden'});
    await page.reload();await page.locator('#workspace').waitFor();await page.locator('[data-view="backup"]').click();
    const pending=page.waitForEvent('download');await page.locator('#download-backup').click();const download=await pending;
    const backup=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(backup.counts.expenses,3561);assert.ok(backup.data.expenses.some(e=>e.date==='2026-09-19'&&e.amount===1000));assert.equal(backup.format,'prep-cafe-backup');
  });
  await check('D04 작업 문서·원본 엑셀·실행 코드 공개 제외',async()=>{
    for(const route of ['/docs/01_PRD.md','/server.mjs','/package.json','/build.mjs','/data/매장운영데이터.json','/design/_1/code.html'])assert.equal((await context.request.get(url+route)).status(),404);
    assert.deepEqual(errors,[]);
  });
}catch(e){console.error(e.stack);process.exitCode=1;}
finally{
  await mkdir('tests/results',{recursive:true});await writeFile('tests/results/deployment-browser.json',JSON.stringify({browser:'Microsoft Edge',version:browser.version(),target:'generated dist (isolated local static host)',results,consoleErrors:errors},null,2));
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
