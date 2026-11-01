/** Linux Docker acceptance. Start scripts/mock-llm-server.mjs first. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const image='audit-studio:dsh-acceptance';const name='audit-dsh-check-'+Date.now();
const base='http://127.0.0.1:18286';
const run=async(args)=>{const child=spawn('docker',args,{stdio:'inherit'});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('docker exited '+code)));});};
await run(['build','-t',image,'.']);
let started=false;
const json=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
const wait=async(fn)=>{for(let i=0;i<180;i++){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('Docker acceptance timeout');};
try {
 // Linux host networking lets the isolated container reach the loopback mock.
 await run(['run','-d','--rm','--network=host','--name',name,'-e','PORT=18286',image]);started=true;
 await wait(async()=>{const r=await fetch(base+'/api/home');return r.ok;});
 await json('/api/models-config','PUT',{providers:{mock:{api:'openai-completions',baseUrl:'http://127.0.0.1:19999/v1',apiKey:'container-mock-key',models:[{id:'mock-a'}]}}});
 await json('/api/models-config/default','PUT',{defaultProvider:'mock',defaultModel:'mock-a'});
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'normal'})});
 const {sessionId}=await json('/api/agent/new','POST',{cwd:'/tmp'});
 await json(`/api/agent/${sessionId}`,'POST',{message:'Docker acceptance conversation'});
 await wait(async()=>!(await json(`/api/agent/${sessionId}`)).isStreaming);
 const context=await json(`/api/sessions/${sessionId}/context`);
 assert.ok(context.messages.some(m=>m.role==='assistant'&&!m.errorMessage&&m.content.some(p=>p.type==='text'&&p.text)));
 const {stdout}=await exec('docker',['exec',name,'node','-p','require("/app/node_modules/@deepseek-ai/dsh/package.json").version']);
 assert.equal(stdout.trim(),'0.2.1-rc.5');
 console.log('PASS Docker build and real dsh conversation in running image');
} finally {if(started)await exec('docker',['stop','--time','10',name]);}
