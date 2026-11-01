import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dshHome } from "../app-config";
import { assertSessionId } from "../session-index";
/** rc.5 stores sessions below a project-key directory, not directly at root. */
export function deleteDshFiles(id:string) {
  assertSessionId(id);
  const root=join(dshHome(),"sessions");
  if(existsSync(root)) {
    for(const project of readdirSync(root,{withFileTypes:true})) {
      // Never follow a project-directory symlink outside the owned root.
      if(project.isDirectory())rmSync(join(root,project.name,id),{recursive:true,force:true});
    }
  }
  rmSync(join(dshHome(),"storages","session_projcache","sessions",id+".json"),{force:true});
}
