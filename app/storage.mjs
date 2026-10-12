import {validateData} from './core.mjs';
export const DATABASE='prep-cafe-operations-v1';
export class ConflictError extends Error {constructor(){super('다른 탭에서 기록이 변경됐습니다. 최신 자료를 불러온 뒤 입력을 확인하고 다시 저장하세요.');this.name='ConflictError';}}
export function openDatabase(factory=globalThis.indexedDB,name=DATABASE) {
  return new Promise((resolve,reject)=>{
    if(!factory)return reject(new Error('이 브라우저에서 기록 저장소를 사용할 수 없습니다.'));
    const req=factory.open(name,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('appState');
    req.onerror=()=>reject(req.error||new Error('저장소를 열 수 없습니다.'));
    req.onblocked=()=>reject(new Error('다른 탭을 닫고 다시 열어 주세요. 저장소 연결이 막혀 있습니다.'));
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
  });
}
export function readState(db) {
  return new Promise((resolve,reject)=>{
    let value;const tx=db.transaction('appState','readonly');const req=tx.objectStore('appState').get('main');
    req.onsuccess=()=>{value=req.result;};
    tx.oncomplete=()=>resolve(value);
    tx.onabort=()=>reject(tx.error||new Error('기록 읽기가 중단됐습니다.'));
    tx.onerror=()=>{};
  });
}
export function commitState(db,data,expectedRevision,{abortAfterPut=false}={}) {
  return new Promise((resolve,reject)=>{
    let next,cause;
    const tx=db.transaction('appState','readwrite');const store=tx.objectStore('appState');const req=store.get('main');
    req.onsuccess=()=>{
      const current=req.result;
      const actual=current?.revision??null;
      if(actual!==expectedRevision){cause=new ConflictError();tx.abort();return;}
      next={schemaVersion:1,calculationVersion:1,revision:(current?.revision??-1)+1,initialized:true,data};
      const put=store.put(next,'main');
      if(abortAfterPut)put.onsuccess=()=>{cause=new Error('검사용 저장 중단');tx.abort();};
    };
    tx.oncomplete=()=>resolve(next);
    tx.onabort=()=>reject(cause||tx.error||new Error('저장에 실패했습니다. 기존 자료는 유지됩니다.'));
    tx.onerror=()=>{};
  });
}
export async function initialize(db,loadInitial) {
  let existing=await readState(db);
  if(existing){
    if(existing.schemaVersion!==1||!existing.initialized||!Number.isSafeInteger(existing.revision))throw new Error('저장된 자료의 구조를 확인할 수 없습니다. 자동 초기화하지 않았습니다.');
    validateData(existing.data);return existing;
  }
  const data=await loadInitial();validateData(data);
  data.settings={...data.settings,minimum_quantities:data.settings?.minimum_quantities||{}};
  try{return await commitState(db,data,null);}
  catch(e){if(!(e instanceof ConflictError))throw e;existing=await readState(db);validateData(existing.data);return existing;}
}
