export const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  "minimax-TokenPlan-cn": "MiniMax",
  "bailian-cn": "阿里云百炼（CN）",
  "zhipu-coding-cn": "智谱 (中国)",
  custom: "自定义 / Custom",
};

export const PROVIDER_LOGOS: Record<string, string> = {
  deepseek: "/providers/deepseek.svg",
  "minimax-TokenPlan-cn": "/providers/minimax.svg",
  "bailian-cn": "/providers/bailian.svg",
  "zhipu-coding-cn": "/providers/zhipu.svg",
};

export function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

export function getProviderLogo(providerId: string): string | undefined {
  return PROVIDER_LOGOS[providerId];
}
