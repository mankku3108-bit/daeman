import {readFile,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateData} from './app/core.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
export const output=path.resolve(root,'dist');
export const publicFiles=new Map([
  ['index.html','app/index.html'],
  ['app/app.mjs','app/app.mjs'],
  ['app/core.mjs','app/core.mjs'],
  ['app/storage.mjs','app/storage.mjs'],
  ['app/style.css','app/style.css'],
  ['favicon.svg','app/favicon.svg'],
  ['data/initial.json','data/매장운영데이터.json']
]);

export async function buildSite(){
  // Check every input before replacing the generated directory.
  const files=await Promise.all([...publicFiles].map(async([target,source])=>[target,await readFile(path.join(root,source))]));
  validateData(JSON.parse(files.find(([target])=>target==='data/initial.json')[1].toString('utf8')));
  if(path.dirname(output)!==root||path.basename(output)!=='dist')throw new Error('잘못된 배포 출력 경로입니다.');
  try{if(await realpath(output)!==output)throw new Error('배포 출력 폴더가 다른 경로로 연결되어 있습니다.');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  await rm(output,{recursive:true,force:true});
  for(const [target,bytes] of files){
    const destination=path.join(output,target);
    await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);
  }
  return [...publicFiles.keys()];
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const files=await buildSite();console.log(`배포 준비 완료: dist/ (${files.length}개 공개 파일)`);
}
