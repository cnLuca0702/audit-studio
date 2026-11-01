import { readFileSync } from "node:fs";
import { appPath } from "./app-config";
export interface ResolvedAgentModel {id:string;name:string;provider:string;api:string;}
export function resolveModel(provider:string,modelId:string): ResolvedAgentModel | null {
  try {
    const config=JSON.parse(readFileSync(appPath("models.json"),"utf8"));
    const route=config.providers?.[provider];
    const model=route?.models?.find((m:{id:string})=>m.id===modelId);
    return model ? {id:model.id,name:model.name || model.id,provider,api:route.api || "openai-completions"} : null;
  } catch {return null;}
}
export function resolveDefaultModelFromSettings() {
  try {
    const {defaultProvider:provider,defaultModel:modelId}=JSON.parse(readFileSync(appPath("settings.json"),"utf8"));
    return provider && modelId ? {provider,modelId,model:resolveModel(provider,modelId)} : null;
  } catch {return null;}
}
