'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const h = require('./service-harness.cjs');
const project = 'anandhi-stores';
const base = 'https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents';
const resource = 'projects/'+project+'/databases/(default)/documents/';
const envPath=path.resolve(h.root,'../.env');
function readEnv(){return Object.fromEntries(fs.readFileSync(envPath,'utf8').split(/\r?\n/).flatMap(line=>{const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);return match?[[match[1],match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/,(_,a,b)=>a??b??'')]]:[]}));}
async function connect(){
  const env=readEnv();
  if(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID&&env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!==project)throw new Error('Development tests are restricted to '+project);
  if(env.EXPO_PUBLIC_DEMO_MODE==='false'||env.ENABLE_DEMO_LOGIN!=='true')throw new Error('Development demo mode must be explicitly enabled.');
  if(!env.FIREBASE_TOKEN)throw new Error('Root .env needs FIREBASE_TOKEN for privileged development integration.');
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:env.FIREBASE_TOKEN,client_id:'563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',client_secret:'j9iVZfS8kkCEFUPaAeJV0sAi'}),signal:AbortSignal.timeout(25000)});
  const token=await tokenRes.json();if(!tokenRes.ok||!token.access_token)throw new Error('Firebase CLI token authentication failed: '+(token.error||tokenRes.status));
  let requests=1;
  async function api(suffix,options={}){requests++;const response=await fetch(base+suffix,{...options,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)});if(response.status===404)return null;const body=await response.json();if(!response.ok)throw Object.assign(new Error('Firestore '+(body.error?.status||response.status)+': '+(body.error?.message||'request failed')),{code:body.error?.status});return body;}
  function decode(value){if(value.timestampValue)return new h.TestTimestamp(Date.parse(value.timestampValue));if('stringValue'in value)return value.stringValue;if('integerValue'in value)return Number(value.integerValue);if('doubleValue'in value)return value.doubleValue;if('booleanValue'in value)return value.booleanValue;if('nullValue'in value)return null;if(value.arrayValue)return (value.arrayValue.values||[]).map(decode);if(value.mapValue)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));return value;}
  function encode(value){if(value instanceof h.TestTimestamp)return {timestampValue:value.toDate().toISOString()};if(value===null)return {nullValue:null};if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};if(value&&typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]))}};throw new Error('Unsupported Firestore test value');}
  const refPath=ref=>ref.collection+'/'+ref.id;
  const fieldPath=parts=>parts.map(p=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)?p:'\x60'+p.replace(/\\/g,'\\\\').replace(/\x60/g,'\\\x60')+'\x60').join('.');
  const valueFor=(data,parts)=>parts.reduce((v,k)=>v?.[k],data);
  function asSnap(ref,wire){const data=wire?Object.fromEntries(Object.entries(wire.fields||{}).map(([k,v])=>[k,decode(v)])):undefined;return {id:ref.id,ref,exists:()=>!!wire,data:()=>data};}
  async function getDoc(ref,transaction){const wire=await api('/'+refPath(ref)+(transaction?'?transaction='+encodeURIComponent(transaction):''));return asSnap(ref,wire);}
  function makeWrite(type,ref,data,options={}){const name=resource+refPath(ref);if(type==='delete')return {delete:name};const fields={},mask=[],transforms=[];
    function walk(value,parts,out,key){if(value?.constructor?.name==='Increment'){transforms.push({fieldPath:fieldPath(parts),increment:{integerValue:String(value.amount)}});return;}
      if(value&&value.__arrayUnion){transforms.push({fieldPath:fieldPath(parts),appendMissingElements:{values:value.values.map(encode)}});return;}
      if(value&&value.__arrayRemove){transforms.push({fieldPath:fieldPath(parts),removeAllFromArray:{values:value.values.map(encode)}});return;}
      if(value===undefined)return;
      if(options.merge&&value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof h.TestTimestamp)&&Object.keys(value).length){const children={};out[key]={mapValue:{fields:children}};for(const [k,v]of Object.entries(value))walk(v,[...parts,k],children,k);return;}
      out[key]=encode(value);mask.push(fieldPath(parts));
    }
    for(const [key,value]of Object.entries(data||{})){const parts=key.split('.');let out=fields;for(const part of parts.slice(0,-1)){out[part]??={mapValue:{fields:{}}};out=out[part].mapValue.fields;}walk(value,parts,out,parts.at(-1));}
    return {update:{name,fields},...(options.merge||type==='update'?{updateMask:{fieldPaths:mask}}:{}),...(transforms.length?{updateTransforms:transforms}:{}),...(type==='update'?{currentDocument:{exists:true}}:{})};
  }
  async function getDocs(target){const col=target.kind==='query'?target.parts[0].name:target.name;const parts=target.parts||[];const conditions=parts.filter(p=>p.kind==='where').map(p=>({fieldFilter:{field:{fieldPath:p.args[0]},op:({'==':'EQUAL','in':'IN','>':'GREATER_THAN','>=':'GREATER_THAN_OR_EQUAL','<':'LESS_THAN','<=':'LESS_THAN_OR_EQUAL'})[p.args[1]],value:encode(p.args[2])}}));const ordering=parts.filter(p=>p.kind==='orderBy');const q={from:[{collectionId:col}],...(conditions.length?{where:conditions.length===1?conditions[0]:{compositeFilter:{op:'AND',filters:conditions}}}:{}),...(ordering.length?{orderBy:ordering.map(p=>({field:{fieldPath:p.args[0]},direction:p.args[1]==='desc'?'DESCENDING':'ASCENDING'}))}:{}),limit:parts.find(p=>p.kind==='limit')?.value||1000};
    const cursor=parts.find(p=>p.kind==='cursor');if(cursor){const snap=await getDoc(h.firestore.doc(h.db,col,cursor.id));q.startAt={before:false,values:ordering.map(p=>p.args[0]==='__name__'?{referenceValue:resource+col+'/'+cursor.id}:encode(valueFor(snap.data(),p.args[0].split('.'))))};}
    const result=await api(':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:q})});const docs=(result||[]).filter(r=>r.document).map(r=>asSnap(h.firestore.doc(h.db,col,r.document.name.split('/').at(-1)),r.document));return {docs,empty:!docs.length,size:docs.length,forEach:fn=>docs.forEach(fn)};
  }
  const commit=writes=>api(':commit',{method:'POST',body:JSON.stringify({writes})});
  async function runTransaction(_db,callback){for(let retry=0;retry<4;retry++){const transaction=(await api(':beginTransaction',{method:'POST',body:'{}'})).transaction;const writes=[];try{const result=await callback({get:ref=>getDoc(ref,transaction),set:(ref,data,options={})=>writes.push(makeWrite('set',ref,data,options)),update:(ref,data)=>writes.push(makeWrite('update',ref,data)),delete:ref=>writes.push(makeWrite('delete',ref))});await api(':commit',{method:'POST',body:JSON.stringify({writes,transaction})});return result;}catch(error){await api(':rollback',{method:'POST',body:JSON.stringify({transaction})}).catch(()=>{});if(error.code==='ABORTED'&&retry<3)continue;throw error;}}}
  const originalDoc=h.firestore.doc;const runId='test-'+Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex');let generated=0;const created=new Set();
  h.firestore.doc=(...args)=>{const ref=originalDoc(...args);if((args[0]?.kind==='collection'&&!args[1])||(args[0]?.kind==='db'&&!args[2]&&!String(args[1]).includes('/'))){ref.id=runId+'-'+(++generated);created.add(refPath(ref));}return ref;};
  Object.assign(h.firestore,{getDoc,getDocs,runTransaction,async addDoc(collection,data){const ref=h.firestore.doc(collection);await commit([makeWrite('set',ref,data)]);return ref;},async setDoc(ref,data,options={}){await commit([makeWrite('set',ref,data,options)]);},async updateDoc(ref,data){await commit([makeWrite('update',ref,data)]);},async deleteDoc(ref){await commit([makeWrite('delete',ref)]);},writeBatch(){const writes=[];return {set(ref,data,options={}){writes.push(makeWrite('set',ref,data,options));},update(ref,data){writes.push(makeWrite('update',ref,data));},delete(ref){writes.push(makeWrite('delete',ref));},commit:()=>commit(writes)};},onSnapshot(target,next,error){let stopped=false;(target.kind==='doc'?getDoc(target):getDocs(target)).then(snap=>{if(!stopped)next(snap);},e=>{if(!stopped)error?.(e);});return ()=>{stopped=true;};}});
  h.TestTimestamp.base=Date.now();
  h.setDemoConfig({enabled:true,...Object.fromEntries(['admin','customer','agent'].map(role=>[role,{phone:env[role.toUpperCase()+'_PHONE'],pin:env[role.toUpperCase()+'_PIN'],name:env[role.toUpperCase()+'_NAME']}]))});
  const actors={};for(const role of ['admin','customer','agent']){const id=env[role.toUpperCase()+'_USER_ID'];if(!id)throw new Error('Missing '+role+' USER_ID in root .env');const snap=await getDoc(originalDoc(h.db,'users',id));const data=snap.data();if(!snap.exists()||data.role!==role||data.phone!==env[role.toUpperCase()+'_PHONE']||!data.isDemo)throw new Error('Development '+role+' identity does not match root .env');actors[role]={uid:id,id,role,name:data.name,phone:data.phone,isDemo:true};}
  return {env,actors,runId,created,api,encode,decode,getDoc,getDocs,commit,makeWrite,requests:()=>requests,resource};
}
module.exports={connect,project};
