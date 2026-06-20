/**
 * Normalize toolCall field names from various formats to a consistent format.
 *
 * Different versions of the SDK may use different field names:
 * - toolCallId vs id
 * - toolName vs name
 * - input vs arguments
 */

export interface NormalizedToolCall {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
}

export function normalizeToolCall(toolCall: any): NormalizedToolCall {
  return {
    type: "toolCall",
    toolCallId:
      typeof toolCall.toolCallId === "string"
        ? toolCall.toolCallId
        : typeof toolCall.id === "string"
          ? toolCall.id
          : "",
    toolName:
      typeof toolCall.toolName === "string"
        ? toolCall.toolName
        : typeof toolCall.name === "string"
          ? toolCall.name
          : "",
    input:
      typeof toolCall.input === "object" && toolCall.input !== null
        ? toolCall.input
        : typeof toolCall.arguments === "object" && toolCall.arguments !== null
          ? toolCall.arguments
          : {},
  };
}

export function normalizeAssistantMessage(message: any): any {
  if (message.role !== "assistant") return message;

  const content = message.content;
  if (!Array.isArray(content)) return message;

  const normalizedContent = content.map((item: any) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return item;
    }

    if (item.type === "toolCall") {
      return normalizeToolCall(item);
    }

    return item;
  });

  return {
    ...message,
    content: normalizedContent,
  };
}
