import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildSite,output,publicFiles} from '../build.mjs';

test('배포 설정은 로컬 서버 대신 공개 파일 폴더를 지정',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,null);assert.equal(config.buildCommand,'node build.mjs');assert.equal(config.outputDirectory,'dist');
  assert.equal(config.headers[0].headers.find(h=>h.key==='X-Content-Type-Options').value,'nosniff');
  assert.equal(config.headers[1].headers[0].value,'text/javascript; charset=utf-8');
});
test('실제 배포 산출물은 공개 7개 파일만 포함하고 오래된 파일도 제거',async()=>{
  await mkdir(path.join(output,'docs'),{recursive:true});await writeFile(path.join(output,'docs','old-generated.txt'),'old output');
  assert.deepEqual(await buildSite(),[...publicFiles.keys()]);
  async function list(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())result.push(...await list(p));else result.push(path.relative(output,p).replaceAll('\\','/'));}return result;}
  assert.deepEqual((await list(output)).sort(),[...publicFiles.keys()].sort());
  for(const [target,source] of publicFiles){assert.deepEqual(await readFile(path.join(output,target)),await readFile(new URL('../'+source,import.meta.url)));}
  const index=await readFile(path.join(output,'index.html'),'utf8');assert.match(index,/src="\/app\/app.mjs"/);
  const json=JSON.parse(await readFile(path.join(output,'data','initial.json'),'utf8'));assert.equal(json.meta.data_class,'가상 매장 샘플');assert.equal(json.sales.length,6112);
});
