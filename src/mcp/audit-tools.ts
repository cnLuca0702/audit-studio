import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DOCUMENT_PROMPT, exportDocument } from "../lib/chat-documents";
const server = new McpServer({name:"audit-tools",version:"1.0.0"});
server.registerTool("export_document", {
  description: DOCUMENT_PROMPT,
  inputSchema: {filename:z.string(), format:z.enum(["docx","pdf","md","txt"]), content:z.string()},
}, async args => {
  try {
    const result = await exportDocument(process.env.AUDIT_STUDIO_CWD || process.cwd(), args);
    return {content:[{type:"text",text:JSON.stringify(result)}]};
  } catch (error) { return {isError:true,content:[{type:"text",text:error instanceof Error ? error.message : "文档生成失败"}]}; }
});
await server.connect(new StdioServerTransport());
