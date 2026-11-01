import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,statSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {appHome,dshHome} from './app-config.ts';
test('first migration copies only config and skills, and restricts root permissions',()=>{
 const root=mkdtempSync(join(tmpdir(),'audit-config-test-'));
 const savedHome=process.env.HOME,savedApp=process.env.AUDIT_STUDIO_HOME;
 try {
  process.env.HOME=root;process.env.AUDIT_STUDIO_HOME=join(root,'app');
  const legacy=join(root,'.pi/agent');mkdirSync(join(legacy,'skills/example'),{recursive:true});
  mkdirSync(join(legacy,'sessions'));writeFileSync(join(legacy,'sessions/private'),'must stay');
  for(const name of ['models.json','settings.json','auth.json'])writeFileSync(join(legacy,name),'{}');
  writeFileSync(join(legacy,'skills/example/SKILL.md'),'test skill');
  const app=appHome();
  for(const name of ['models.json','settings.json','auth.json','skills/example/SKILL.md'])assert.ok(existsSync(join(app,name)));
  assert.ok(!existsSync(join(app,'sessions')));assert.equal(statSync(app).mode&0o777,0o700);
  chmodSync(app,0o755);assert.equal(statSync(appHome()).mode&0o777,0o700);
  assert.ok(existsSync(join(dshHome(),'skills/example/SKILL.md')));
  assert.ok(existsSync(join(legacy,'sessions/private')));
 } finally {
  if(savedHome===undefined)delete process.env.HOME;else process.env.HOME=savedHome;
  if(savedApp===undefined)delete process.env.AUDIT_STUDIO_HOME;else process.env.AUDIT_STUDIO_HOME=savedApp;
  rmSync(root,{recursive:true,force:true});
 }
});
