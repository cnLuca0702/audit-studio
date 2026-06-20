export function filesListUrl(absPath: string): string {
  return `/api/cwd/browse?path=${encodeURIComponent(absPath.replace(/\/+$/, ""))}`;
}

export function parentPath(absPath: string): string {
  const trimmed = absPath.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export async function fetchDirectory(path: string): Promise<{ path: string; entries: DirEntry[] }> {
  const res = await fetch(filesListUrl(path));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list directory");
  const entries = (data.entries ?? [])
    .filter((e: DirEntry) => e.isDirectory)
    .sort((a: DirEntry, b: DirEntry) => a.name.localeCompare(b.name));
  return { path: data.path ?? path, entries };
}

export function displayPath(path: string, homePath?: string): string {
  if (!path) return "";
  if (homePath && path.startsWith(homePath)) {
    return "~" + path.slice(homePath.length);
  }
  return path;
}
