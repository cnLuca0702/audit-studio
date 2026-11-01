/** Isolated regression: build first, then node scripts/verify-dsh-rework.mjs.
 * Uses ports 18287/19999; never touches the user's application config. */
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const exec=promisify(execFile), home=await mkdtemp(join(tmpdir(),'audit-dsh-rework-'));
const cwd=join(home,'workspace'),base='http://127.0.0.1:18287',checks=[],evidence={};
const check=message=>{checks.push(message);console.log('PASS '+message);};
await mkdir(cwd);
const models={providers:{mock:{api:'openai-completions',baseUrl:'http://127.0.0.1:19999/v1',apiKey:'rework-secret',models:[
 {id:'mock-a',reasoning:true,thinkingLevelMap:{off:null,minimal:null,low:'low',medium:null,high:'high',xhigh:null}},
 {id:'mock-plain',thinkingLevelMap:{off:null,minimal:null,high:null}},
]}}};
await writeFile(join(home,'models.json'),JSON.stringify(models));
await writeFile(join(home,'settings.json'),JSON.stringify({defaultProvider:'mock',defaultModel:'mock-a',defaultThinkingLevel:'low'}));
const mock=spawn(process.execPath,['scripts/mock-llm-server.mjs'],{stdio:'ignore'});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','18287'],{env:{...process.env,AUDIT_STUDIO_HOME:home},stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,ms=15000)=>{const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await pause(100);}throw Error('regression timeout');};
const raw=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()};};
const api=async(...args)=>{const r=await raw(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;};
const control=async(mode,hangMs=30000)=>{await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode,hangMs})});};
const pids=async()=>{const {stdout}=await exec('ps',['-eo','pid,args']);return stdout.split('\n').filter(l=>l.trim().endsWith(`/node_modules/.bin/dsh --profile acp --patch ${home}/dsh/audit-studio.patch.yml`)).map(l=>Number(l.trim().split(/\s/)[0]));};
const status=id=>api(`/api/agent/${id}`);
const idle=id=>wait(async()=>!(await status(id)).isStreaming);
const prompt=(id,message)=>api(`/api/agent/${id}`,'POST',{message});
const context=id=>api(`/api/sessions/${id}/context`);
const stats=async()=> (await (await fetch('http://127.0.0.1:19999/stats')).json()).requests;
const newSession=async()=> (await api('/api/agent/new','POST',{cwd})).sessionId;
try {
 await wait(async()=>{try{return (await fetch(base+'/api/sessions')).ok;}catch{return false;}},30000);
 const id=await newSession();
 await prompt(id,'null-map startup');await idle(id);
 assert.ok(!(await context(id)).messages.at(-1).errorMessage);
 const patch=JSON.parse(await readFile(join(home,'dsh/audit-studio.patch.yml'),'utf8'));
 const entries=patch.find(p=>p.id==='llm-pi-ai').config.providers.mock.models;
 assert.deepEqual(entries[0].reasoningEfforts,{off:null,low:'low',high:'high'});
 assert.equal(entries[1].reasoningEfforts,false);
 check('Pi null effort maps start real dsh; unsupported-only map becomes false');
 for(const level of ['xhigh','garbage',null,{},1]) {const r=await raw(`/api/agent/${id}`,'POST',{command:'set_thinking_level',level});assert.equal(r.status,400);assert.equal(r.data.error,'此模型不支持该思考强度');}
 check('invalid thinking values return safe 400 before upstream invocation');
 await control('hang',30000);
 const events=[],abort=new AbortController();
 const sse=await fetch(base+`/api/agent/${id}/events`,{signal:abort.signal});
 const reading=(async()=>{let pending='';for await(const chunk of sse.body){pending+=new TextDecoder().decode(chunk);let end;while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);if(frame.startsWith('data: '))events.push(JSON.parse(frame.slice(6)));}}})();
 void reading.catch(()=>{});
 await wait(()=>events.some(e=>e.type==='connected'));
 await pause(100);events.length=0;
 await prompt(id,'kill active turn');
 await wait(async()=>JSON.stringify(await stats()).includes('kill active turn'));
 await api(`/api/agent/${id}`,'POST',{message:'queued must be cleared',type:'steer'});
 const old=(await pids())[0];assert.ok(old);const killedAt=Date.now();process.kill(old,'SIGKILL');
 await idle(id);await wait(()=>events.some(e=>e.type==='agent_end'));
 assert.equal(events.filter(e=>e.type==='agent_end').length,1);
 assert.ok((await context(id)).messages.at(-1).errorMessage);
 await api(`/api/agent/${id}/stop`,'POST');
 await wait(async()=>{const next=await pids();return next.length===1&&next[0]!==old;});
 evidence.activeCrash={oldPid:old,newPid:(await pids())[0],settledMs:Date.now()-killedAt,agentEndCount:events.filter(e=>e.type==='agent_end').length,error:(await context(id)).messages.at(-1).errorMessage};
 abort.abort();await reading.catch(()=>{});
 await control('normal');await prompt(id,'resume after active crash');await idle(id);
 assert.ok(!(await context(id)).messages.at(-1).errorMessage);
 assert.ok(!JSON.stringify(await stats()).includes('queued must be cleared'));
 check('active SIGKILL emits one error/agent_end, clears queue, stop returns, auto-restart and resume work');
 const second=await newSession();
 await control('hang',2000);await prompt(id,'first busy');
 await wait(async()=>JSON.stringify(await stats()).includes('first busy'));
 await control('hang',5000);await prompt(second,'second busy');
 await wait(async()=>JSON.stringify(await stats()).includes('second busy'));
 const before=(await pids())[0];
 const search=await api('/api/models-config/default','PUT',{searchApiKey:'search-secret'});
 assert.equal((await pids())[0],before);assert.equal(search.runtime.pendingRestart,false);
 const saved=await api('/api/models-config/default','PUT',{systemPromptMode:'append',systemPrompt:'deferred rework marker'});
 assert.equal(saved.runtime.pendingRestart,true);assert.equal((await pids())[0],before);
 await idle(id);assert.equal((await status(second)).isStreaming,true);assert.equal((await pids())[0],before);
 await idle(second);
 await wait(async()=>{const next=await pids();return next.length===1&&next[0]!==before;});
 assert.ok(!(await context(id)).messages.at(-1).errorMessage);assert.ok(!(await context(second)).messages.at(-1).errorMessage);
 evidence.deferredReload={oldPid:before,newPid:(await pids())[0],searchSave:search.runtime,modelSave:saved.runtime,bothTurnsCompleted:true};
 await control('normal');await prompt(id,'resume after deferred reload');await idle(id);assert.ok(!(await context(id)).messages.at(-1).errorMessage);
 check('search save preserves PID; dsh save waits for all active sessions, both succeed and resume works');
 const settings=JSON.parse(await readFile(join(home,'settings.json'),'utf8'));
 settings.recentCwds=[null,12,{},cwd,cwd,join(home,'bad-cwd')];
 await mkdir(join(home,'bad-cwd'));await writeFile(join(home,'bad-cwd/sessions'),'not a directory');
 await writeFile(join(home,'settings.json'),JSON.stringify(settings));
 await writeFile(join(home,'settings.json'),'null');
 await api('/api/sessions');
 await writeFile(join(home,'settings.json'),JSON.stringify(settings));
 const index=JSON.parse(await readFile(join(home,'session-index.json'),'utf8'));
 await writeFile(join(home,'session-index.json'),JSON.stringify([...index,index[0]]));
 const list=(await api('/api/sessions')).sessions;assert.equal(list.filter(s=>s.id===id).length,1);
 check('malformed recentCwds, failing legacy directory and duplicate IDs do not break session list');
 assert.equal((await stat(home)).mode&0o777,0o700);
 assert.ok(!(await readFile(join(home,'dsh/audit-studio.patch.yml'),'utf8')).includes('rework-secret'));
 // A durable save with no configured default must succeed and expose reload status.
 const missing=await api('/api/models-config/default','PUT',{defaultModel:''});
 assert.ok(missing.runtime.error);assert.equal(JSON.parse(await readFile(join(home,'settings.json'),'utf8')).defaultModel,'');
 await api('/api/models-config/default','PUT',{defaultModel:'mock-a'});
 // Force real dsh initialization failure; upstream diagnostics must remain private.
 models.providers.mock.api='private-upstream-secret-invalid-api';
 const bad=await api('/api/models-config','PUT',models);
 assert.ok(bad);
 const failed=await raw('/api/agent/new','POST',{cwd});assert.ok(failed.status>=400);assert.ok(!JSON.stringify(failed).includes('private-upstream-secret'));
 check('saves survive invalid/incomplete runtime config; agent/new sanitizes startup errors');
 await writeFile('docs/dsh-rework-result.json',JSON.stringify({at:new Date().toISOString(),checks,evidence},null,2)+'\n');
 console.log('PASS '+checks.join('\nPASS '));
} catch(error) {
 console.error('Completed checks:',checks);throw error;
} finally {
 for(const pid of await pids())try{process.kill(pid,'SIGTERM');}catch{}
 server.kill('SIGTERM');mock.kill('SIGTERM');await pause(1600);
 await rm(home,{recursive:true,force:true});
}
