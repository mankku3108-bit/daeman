import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const url='https://daeman.vercel.app';
const {chromium}=await import(pathToFileURL(process.env.CAFE_PLAYWRIGHT||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
page.setDefaultTimeout(20000);const errors=[],responses=[];page.on('pageerror',e=>errors.push(e.message));
try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await page.locator('#workspace').waitFor();
  for(const route of ['/app/app.mjs','/app/core.mjs','/app/storage.mjs','/app/style.css','/favicon.svg','/data/initial.json']){
    const result=await context.request.get(url+route);responses.push({route,status:result.status(),contentType:result.headers()['content-type']});assert.equal(result.status(),200);
    if(route.endsWith('.mjs'))assert.match(result.headers()['content-type'],/javascript/);
  }
  await page.locator('[data-view="pnl"]').click();assert.match(await page.locator('#pnl-rows').innerText(),/6,414,713/);assert.match(await page.locator('#pnl-rows').innerText(),/3,798,010/);assert.deepEqual(errors,[]);
  assert.equal((await context.request.get(url+'/docs/01_PRD.md')).status(),404);
  await mkdir('.test-output',{recursive:true});await page.screenshot({path:'.test-output/vercel-live-pnl.png',fullPage:true});
  await mkdir('tests/results',{recursive:true});await writeFile('tests/results/deployment-live.json',JSON.stringify({url,checkedAt:new Date().toISOString(),status:'pass',pageStatus:response.status(),responses,expectedProfit:6414713,consoleErrors:errors},null,2));
  console.log('PASS actual Vercel: HTTP 200, 6 assets, JavaScript MIME, initialized IndexedDB, September profit, docs 404, no page errors');
}catch(e){console.error(e.stack);process.exitCode=1;}
finally{await context.close();await browser.close();}
