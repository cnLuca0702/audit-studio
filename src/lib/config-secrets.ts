export const SECRET_MASK = "••••••••";

export function maskModelsConfig(config: Record<string, any>) {
  return {
    ...config,
    providers: Object.fromEntries(Object.entries(config.providers ?? {}).map(([id, provider]) => {
      const entry = provider as Record<string, any>;
      return [id, { ...entry, apiKey: entry.apiKey ? SECRET_MASK : "" }];
    })),
  };
}
