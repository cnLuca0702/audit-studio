/** Linux Docker acceptance. Start scripts/mock-llm-server.mjs first. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
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
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'agent-tools'})});
 await json(`/api/agent/${sessionId}`,'POST',{message:'Export Word and PDF documents'});
 await wait(async()=>!(await json(`/api/agent/${sessionId}`)).isStreaming);
 const word=await json('/api/files?'+new URLSearchParams({cwd:'/tmp',path:'/tmp/outputs/spike.docx',action:'preview'}));
 assert.ok(word.content.includes('中文内容'));
 const pdf=await fetch(base+'/api/files?'+new URLSearchParams({cwd:'/tmp',path:'/tmp/outputs/spike.pdf',action:'download'}));
 assert.ok(pdf.ok);
 assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 const {stdout}=await exec('docker',['exec',name,'node','-p','require("/app/node_modules/@deepseek-ai/dsh/package.json").version']);
 assert.equal(stdout.trim(),'0.2.1-rc.5');
 const {stdout:imageId}=await exec('docker',['image','inspect',image,'--format','{{.Id}}']);
 const {stdout:nodeVersion}=await exec('docker',['exec',name,'node','--version']);
 await mkdir('docs',{recursive:true});
 await writeFile('docs/dsh-docker-result.json',JSON.stringify({
  verifiedAt:new Date().toISOString(),image,imageId:imageId.trim(),nodeVersion:nodeVersion.trim(),dshVersion:stdout.trim(),
  checks:['Docker build passed','standalone server starts in container','real dsh process completes a conversation against mock','assistant response persisted in transcript','dsh version is exactly 0.2.1-rc.5','MCP exports Word with Chinese text readable in preview','MCP exports valid PDF using container Chromium'],
 },null,2)+'\n');
 console.log('PASS Docker build, real dsh conversation, MCP Word/PDF exports in running image');
} finally {
 await fetch('http://127.0.0.1:19999/control',{method:'POST',body:JSON.stringify({mode:'normal'})}).catch(()=>undefined);
 if(started)await exec('docker',['stop','--time','10',name]);
}
