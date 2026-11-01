/** Preserve existing lint debt without allowing any new diagnostic through. */
import { ESLint } from 'eslint';
import {readFile} from 'node:fs/promises';
import {relative} from 'node:path';
const baseline=JSON.parse(await readFile(new URL('../eslint-baseline.json',import.meta.url),'utf8'));
const remaining=new Map(baseline.map(([signature,count])=>[signature,count]));
const eslint=new ESLint();
const results=await eslint.lintFiles(process.argv.length>2 ? process.argv.slice(2) : ['.']);
let existing=0;
for(const file of results) {
 const source=file.source || await readFile(file.filePath,'utf8');
 for(const message of file.messages) {
  if(message.severity!==2)continue;
  const signature=JSON.stringify([relative(process.cwd(),file.filePath),message.ruleId,source.split('\n')[message.line-1]?.trim(),message.message.split("\n\n")[0]]);
  const count=remaining.get(signature)||0;
  if(count>0) {remaining.set(signature,count-1);message.severity=1;file.errorCount--;file.warningCount++;existing++;}
 }
}
const formatter=await eslint.loadFormatter('stylish');
process.stdout.write(formatter.format(results));
console.log(`Existing main-branch lint debt: ${existing}; new errors: ${results.reduce((sum,f)=>sum+f.errorCount,0)}. Baseline entries match exact source lines and diagnostics.`);
if(results.some(r=>r.errorCount))process.exitCode=1;
