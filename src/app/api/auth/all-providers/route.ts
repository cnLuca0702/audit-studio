import { NextResponse } from "next/server";

// All supported provider definitions
const ALL_PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "api_key",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1",
    authUrl: "https://platform.deepseek.com/api_keys",
    logo: "/providers/deepseek.svg",
    billingPlans: [
      { value: "payg", label: "按量付费", baseUrl: "https://api.deepseek.com/v1" },
    ],
  },
  {
    id: "minimax-TokenPlan-cn",
    name: "MiniMax",
    type: "api_key",
    api: "openai-completions",
    baseUrl: "https://api.minimaxi.com/v1",
    authUrl: "https://platform.minimaxi.com/",
    logo: "/providers/minimax.svg",
    billingPlans: [
      { value: "token", label: "Token Plan", baseUrl: "https://api.minimaxi.com/v1" },
    ],
  },
  {
    id: "bailian-cn",
    name: "阿里云百炼（CN）",
    type: "api_key",
    api: "openai-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    logo: "/providers/bailian.svg",
    billingPlans: [
      { value: "payg", label: "按量计费", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    ],
  },
  {
    id: "zhipu-coding-cn",
    name: "智谱 (中国)",
    type: "api_key",
    api: "openai-completions",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    authUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    logo: "/providers/zhipu.svg",
    billingPlans: [
      { value: "coding", label: "Coding Plan", baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4" },
    ],
  },
];

// GET /api/auth/all-providers — return all supported providers
export async function GET() {
  return NextResponse.json({ providers: ALL_PROVIDERS });
}
