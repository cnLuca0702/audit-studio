/** 统一搜索请求，供城市研究和服务端 Key 验证复用。 */
export async function requestWebSearch(
  provider: string,
  apiKey: string,
  query: string,
  count = 5,
  signal?: AbortSignal
): Promise<any> {
  const encoded = encodeURIComponent(query);
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  let url: string;
  let init: RequestInit = {};
  switch (provider) {
    case "serpapi":
      url = `https://serpapi.com/search?engine=google&q=${encoded}&api_key=${encodeURIComponent(apiKey)}&hl=zh-CN&gl=cn&num=${count}`;
      break;
    case "brave":
      url = `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=${count}`;
      init.headers = { Accept: "application/json", "X-Subscription-Token": apiKey, "Accept-Language": "zh-CN" };
      break;
    case "tavily":
      url = "https://api.tavily.com/search";
      init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query, max_results: count, search_depth: count === 1 ? "basic" : "advanced" }),
      };
      break;
    case "bing":
      url = `https://api.bing.microsoft.com/v7.0/search?q=${encoded}&count=${count}&mkt=zh-CN`;
      init.headers = { "Ocp-Apim-Subscription-Key": apiKey };
      break;
    default:
      throw new Error("不支持的搜索服务商");
  }
  const res = await fetch(url, { ...init, signal: requestSignal });
  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 403 ? "API Key 无效" : `搜索 API 错误：HTTP ${res.status}`);
  }
  const data = await res.json();
  // SerpAPI 也可能以 HTTP 200 返回业务错误；不透传上游文本，避免回显密钥。
  if (data.error) throw new Error("搜索 API 验证失败，请检查 Key 和服务额度");
  return data;
}
