import {build} from 'esbuild';
await build({entryPoints:['src/mcp/audit-tools.ts'],outfile:'dist-mcp/audit-tools.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node22'});
