import { chmodSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The application owns its configuration; dsh receives credentials only in env. */
export function appHome(): string {
  const root = resolve(process.env.AUDIT_STUDIO_HOME || join(homedir(), ".audit-studio"));
  if (!existsSync(root)) {
    const legacy = join(homedir(), ".pi", "agent");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const name of ["models.json", "settings.json", "auth.json", "skills"]) {
      const source = join(legacy,name);
      if (existsSync(source)) cpSync(source,join(root,name),{recursive:true});
    }
  }
  chmodSync(root,0o700);
  return root;
}
export function appPath(...parts: string[]): string { return join(appHome(), ...parts); }
export function dshHome(): string {
  const root = appPath("dsh");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const skills = join(root, "skills");
  if (!existsSync(skills) && existsSync(appPath("skills"))) cpSync(appPath("skills"), skills, { recursive: true });
  chmodSync(root,0o700);
  return root;
}
export function skillsDir(): string { return join(dshHome(), "skills"); }
