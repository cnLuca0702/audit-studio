import type { SessionConfigOption } from "@agentclientprotocol/sdk";

/** ACP advertises reasoning choices per model; a saved global level may not apply. */
export function reasoningSelection(options: readonly SessionConfigOption[] | null | undefined, preferred?: string) {
  const option = options?.find(option => option.id === "reasoning_effort");
  if (!option || option.type !== "select") return { level: "off", change: undefined };
  const choices = option.options.flatMap(entry => "options" in entry ? entry.options : [entry]);
  const selected = preferred !== undefined && choices.some(choice => choice.value === preferred)
    ? preferred : option.currentValue;
  return { level: selected || "off", change: selected !== option.currentValue ? selected : undefined };
}
