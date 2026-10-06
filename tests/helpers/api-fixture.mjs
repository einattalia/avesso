import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// Load the actual route and authorization code, replacing only external services.
export async function fixture({routeName="files",member=true,client=false,token=true,parts,object,completed=false,legacy=false,rpcError=false,r2Error=null,r2ErrorAt=null}={}) {
  const calls=[];
  const s={id:'session',user_id:'user',demand_id:'demand',object_key:'trusted/key',bucket:'bucket',upload_id:'multipart',file_name:'v.mp4',file_size:7,mime_type:'video/mp4',fingerprint:'a'.repeat(64),part_size:64*1024*1024,state:completed?'completed':'pending',version_number:completed?1:null,expires_at:new Date(Date.now()+86400000).toISOString()};
  const versions=[{id:'version',demand_id:'demand',storage_path:'trusted/key',storage_provider:legacy?'supabase':'r2',status:client?'draft':'sent_for_review'}];
  const tables={client_materials:[],client_notes:[],client_assets:[],profiles:[],approval_events:[],recording_sessions:[],clients:[{id:'client',organization_id:'org'},{id:'foreign-client',organization_id:'other'}],briefing_documents:[{client_id:'client',content:'Brief original'}],briefing_files:[],briefing_upload_sessions:[{...s,client_id:'client',object_key:'briefing/trusted/key',mime_type:'application/pdf'}],production_activity:[],approval_notifications:[],contracts:[{id:'contract',client_id:'client',organization_id:'org'}],contract_items:[{id:'art1',contract_id:'contract',name:'Estáticos',monthly_quantity:4,extra_value:20,is_active:true},{id:'art2',contract_id:'contract',name:'Carrosséis',monthly_quantity:2,extra_value:20,is_active:true}],agency_team_members:[{id:'designer',organization_id:'org',name:'Maia',role:'designer',is_active:true},{id:'videomaker',organization_id:'org',name:'Rafa',role:'videomaker',is_active:true},{id:'foreign',organization_id:'other',name:'Outro',role:'designer',is_active:true}],contract_item_assignments:[],contract_documents:[{contract_id:'contract',content:'Original'}],contract_files:[{id:'session',contract_id:'contract',bucket:'bucket',storage_path:'contracts/trusted/key',file_name:'Contrato.pdf',file_size:7,mime_type:'application/pdf'}],contract_upload_sessions:[{...s,contract_id:'contract',object_key:'contracts/trusted/key',mime_type:'application/pdf'}],demands:[{id:'demand',client_id:'client',organization_id:'org'}],organization_members:member?[{user_id:'user',organization_id:'org',is_active:true,role:client?'client_user':'admin'}]:[],client_users:client?[{user_id:'user',client_id:'client'}]:[],r2_upload_sessions:[s],demand_versions:versions};
  function query(table) {
    let filters=[],mutation=null,values=null,single=false,countMode=false;
    const matches=r=>filters.every(f=>f(r));
    function result(){let rows=(tables[table]||[]).filter(matches);
      if(mutation==='insert'){rows=(Array.isArray(values)?values:[values]).map(v=>({id:randomUUID(),created_at:new Date().toISOString(),...v}));(tables[table]||=[]).push(...rows);}
      if(mutation==='update')rows.forEach(r=>Object.assign(r,values));
      if(mutation==='upsert'){rows=[];for(const row of Array.isArray(values)?values:[values]){const key=table==='briefing_documents'?'client_id':table==='contract_documents'?'contract_id':'contract_item_id';const existing=tables[table].find(r=>r[key]===row[key]);if(existing){Object.assign(existing,row);rows.push(existing)}else {tables[table].push(row);rows.push(row)}}}
      return {data:single?rows[0]||null:rows,error:null,count:countMode?rows.length:null};
    }
    const q={select(_columns,options){countMode=!!options?.count;return q},eq(k,v){filters.push(r=>r[k]===v);return q},gt(k,v){filters.push(r=>r[k]>v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},not(k,_op,v){filters.push(r=>r[k]!==v);return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v){mutation='insert';values=v;return q},update(v){mutation='update';values=v;return q},upsert(v){mutation='upsert';values=v;return q},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
  }
  const db={from:query,auth:{getUser:async supplied=>({data:{user:token&&supplied==='valid'?{id:'user'}:null},error:token?null:{}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://legacy.test/file'}})})},rpc:async(name,args)=>{calls.push('rpc');if(name==='avesso_review_with_note')return rpcError?{error:{code:'DB_FAIL'}}:{data:args.decision==='changes'?'adjustments':'approved'};if(name==='avesso_production_action')return rpcError?{error:{code:'DB_FAIL'}}:{data:args.action_name==='send'?'with_client':'approved'};if(name==='avesso_finalize_briefing_upload'){tables.briefing_upload_sessions[0].state='completed';return {data:tables.briefing_upload_sessions[0].id};}if(name==='avesso_merge_contract_arts')return {data:args.main_id};if(name==='avesso_finalize_contract_upload'){tables.contract_upload_sessions[0].state='completed';return {data:tables.contract_upload_sessions[0].id};}if(rpcError)return {error:{code:'DB_FAIL'}};s.state='completed';s.version_number=1;return {data:1};}};
  const commandNames=['PutObjectCommand','CopyObjectCommand','AbortMultipartUploadCommand','CompleteMultipartUploadCommand','CreateMultipartUploadCommand','GetObjectCommand','HeadObjectCommand','ListPartsCommand','UploadPartCommand'];
  const aws=Object.fromEntries(commandNames.map(name=>[name,class {constructor(input){this.name=name;this.input=input;}}]));
  let currentObject=object;
  aws.S3Client=class {async send(command){calls.push(command);if(r2Error&&(!r2ErrorAt||r2ErrorAt===command.name))throw r2Error;switch(command.name){case 'CreateMultipartUploadCommand':return {UploadId:'new-upload'};case 'ListPartsCommand':return {Parts:parts||[{PartNumber:1,ETag:'tag',Size:7}]};case 'HeadObjectCommand':if(currentObject)return currentObject;throw {$metadata:{httpStatusCode:404}};case 'CompleteMultipartUploadCommand':currentObject={ContentLength:7,ContentType:(command.input.Key.startsWith('contracts/')||command.input.Key.startsWith('briefing/'))?'application/pdf':'video/mp4'};return {};default:return {};}}};
  const context=vm.createContext({Request,Response,console:{error(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://supabase.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret',R2_ACCOUNT_ID:'0123456789abcdef0123456789abcdef',R2_ACCESS_KEY_ID:'access',R2_SECRET_ACCESS_KEY:'secret',R2_BUCKET_NAME:'bucket'}},Date,URL});
  const cached=new Map();
  async function synthetic(name,exports) {
    if(cached.has(name))return cached.get(name);
    const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});cached.set(name,m);return m;
  }
  async function load(name) {
    if(cached.has(name))return cached.get(name);
    if(name==='server-only')return synthetic(name,{});
    if(name==='node:crypto')return synthetic(name,{randomUUID});
    if(name==='@supabase/supabase-js')return synthetic(name,{createClient:()=>db});
    if(name==='@aws-sdk/client-s3')return synthetic(name,aws);
    if(name==='@aws-sdk/s3-request-presigner')return synthetic(name,{getSignedUrl:async(_client,command)=>{calls.push(command);return `https://r2.test/${command.input.Key}`;}});
    const path=name.includes('workspace-policy')?'lib/workspace-policy.mjs':name==='workspace-route'?'app/api/workspace/route.js':name.includes('upload-policy')?'lib/upload-policy.mjs':name.includes('contract-items')?'lib/contract-items.mjs':name.includes('r2-config')?'lib/r2-config.mjs':name.includes('production-policy')?'lib/production-policy.mjs':name.includes('whatsapp-server')?'lib/whatsapp-server.js':name.includes('r2-server')?'lib/r2-server.js':name==='production-route'?'app/api/production/route.js':name==='team-route'?'app/api/team/route.js':'app/api/files/route.js';
    const m=new vm.SourceTextModule(await readFile(new URL('../../'+path,import.meta.url),'utf8'),{context,identifier:name});cached.set(name,m);await m.link(load);return m;
  }
  const route=await load(routeName==='workspace'?'workspace-route':routeName==='production'?'production-route':routeName==='team'?'team-route':'route');await route.evaluate();
  return {s,calls,tables,request:async body=>{
    const r=await route.namespace.POST(new Request('https://avesso.test/api/files',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};
  }};
}



