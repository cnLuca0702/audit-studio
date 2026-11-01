/** Real dsh ACP spike, isolated from personal configuration. Requires mock server :19999. */
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'audit-dsh-spike-'));
const patchPath=join(root,'patch.yml');
const requests=new Map();let nextId=0;const updates=[];const permissions=[];
const model=(id)=>({id,name:id,contextWindow:128000,maxTokens:4096,reasoningEfforts:{off:null,low:'low',high:'high'}});
await writeFile(patchPath,JSON.stringify([
 {id:'llm-pi-ai',config:{providers:{mock:{api:'openai-completions',baseURL:'http://127.0.0.1:19999/v1',apiKeyEnv:'AUDIT_STUDIO_KEY_SPIKE',models:[model('mock-a'),model('mock-b')]}}}},
 {id:'agent-default-model',config:{provider:'mock',model:'mock-a'}},
 {id:'acp',config:{provider:'mock',model:'mock-a'}},
 {id:'system-prompt',config:{includeHarnessIdentity:false,personaPrefix:'Audit Studio spike persona'}}
]));
const spawnDsh=()=>{
 const child=spawn(resolve('node_modules/.bin/dsh'),['--profile','acp','--patch',patchPath],{env:{...process.env,DSH_HOME:join(root,'dsh'),DSH_TELEMETRY_DISABLED:'1',AUDIT_STUDIO_KEY_SPIKE:'mock-secret-not-in-patch'},stdio:'pipe'});
 let diagnostics='';child.stderr.on('data',b=>{diagnostics+=b.toString();});
 createInterface({input:child.stdout}).on('line',line=>{
  let msg;try{msg=JSON.parse(line);}catch{return;}
  if(msg.method==='session/update')updates.push(msg.params);
  if(msg.method==='session/request_permission') {
   permissions.push(msg.params);
   const option=msg.params.options.find(o=>o.kind==='allow_once');
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}})+'\n');
  }
  if(msg.id!=null && !msg.method) {const p=requests.get(msg.id);if(p){requests.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}
 });
 child.on('exit',()=>{for(const p of requests.values()){clearTimeout(p.timer);p.reject(new Error('dsh exited: '+diagnostics.slice(-5000)));}requests.clear();});
 return child;
};
let child=spawnDsh();
const call=(method,params)=>new Promise((resolve,reject)=>{
 const id=++nextId;const timer=setTimeout(()=>{requests.delete(id);reject(new Error('Timeout: '+method));},60000);
 requests.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
});
const notify=(method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');
const terminate=async()=>{if(child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});};
try {
 const init=await call('initialize',{protocolVersion:1,clientCapabilities:{}});
 const mcpServers=[{name:'audit-tools',command:process.execPath,args:[resolve('dist-mcp/audit-tools.mjs')],env:[{name:'AUDIT_STUDIO_CWD',value:root},...(process.env.CHROMIUM_PATH?[{name:'CHROMIUM_PATH',value:process.env.CHROMIUM_PATH}]:[])]}];
 const session=await call('session/new',{cwd:root,mcpServers});
 const id=session.sessionId;
 assert.equal(session.configOptions.find(o=>o.id==='model').currentValue,JSON.stringify(['mock','mock-a']));
 const modelOption=await call('session/set_config_option',{sessionId:id,configId:'model',value:JSON.stringify(['mock','mock-b'])});
 const reasoningOption=await call('session/set_config_option',{sessionId:id,configId:'reasoning_effort',value:'high'});
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'normal'})});
 const first=await call('session/prompt',{sessionId:id,prompt:[{type:'text',text:'spike hello'}]});
 assert.equal(first.stopReason,'end_turn');
 assert.ok(updates.some(n=>n.update.sessionUpdate==='agent_message_chunk'));
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'agent-tools'})});
 await call('session/prompt',{sessionId:id,prompt:[{type:'text',text:'export docx and pdf'}]});
 assert.ok((await readFile(join(root,'outputs/spike.docx'))).subarray(0,2).toString()==='PK');
 assert.ok((await readFile(join(root,'outputs/spike.pdf'))).subarray(0,5).toString()==='%PDF-');
 await terminate();child=spawnDsh();
 await call('initialize',{protocolVersion:1,clientCapabilities:{}});
 const resumed=await call('session/resume',{sessionId:id,cwd:root,mcpServers});
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'normal'})});
 assert.equal((await call('session/prompt',{sessionId:id,prompt:[{type:'text',text:'continue after process restart'}]})).stopReason,'end_turn');
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'hang',hangMs:15000})});
 const pending=call('session/prompt',{sessionId:id,prompt:[{type:'text',text:'cancel me'}]});
 await new Promise(r=>setTimeout(r,500));notify('session/cancel',{sessionId:id});
 assert.equal((await pending).stopReason,'cancelled');
 const evidence={version:'0.2.1-rc.5',patchApplied:true,mcpMounted:true,modelConfigId:'model',modelValue:JSON.stringify(['mock','mock-b']),reasoningConfigId:'reasoning_effort',resumeAfterRestart:true,cancel:true,init,configOptions:session.configOptions,modelOption,reasoningOption,resumed,permissionRequests:permissions,updateExamples:[...new Map(updates.map(n=>[n.update.sessionUpdate,n.update])).values()]};
 await mkdir('docs',{recursive:true});await writeFile('docs/dsh-spike-result.json',JSON.stringify(evidence,null,2));
 console.log('PASS dsh ACP spike: patch, MCP docx/pdf, config options, streaming, restart/resume, cancel');
} finally {await terminate();await rm(root,{recursive:true,force:true});await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'normal'})});}
