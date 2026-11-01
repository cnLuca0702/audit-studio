import { ClientSideConnection, ndJsonStream, type SessionNotification } from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
export function connectAcp(child: ChildProcessWithoutNullStreams, update: (notification: SessionNotification) => void) {
  return new ClientSideConnection(() => ({
    sessionUpdate: async (notification) => { update(notification); },
    requestPermission: async (request) => {
      // Only the trusted local dsh runtime and local tools/MCP mount use this
      // connection. Preserve the existing unattended policy; never expose it
      // as a permission proxy for remote agents.
      const option = request.options.find(o => o.kind === "allow_once");
      return {outcome: option ? {outcome: "selected", optionId: option.optionId} : {outcome: "cancelled"}};
    },
  }), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
}
