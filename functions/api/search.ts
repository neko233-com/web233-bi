type CountryCode = "us" | "china_a" | "hongkong" | "japan" | "global";

interface SearchCandidate {
  name: string;
  ticker: string;
  market: CountryCode;
  marketLabel: string;
  sector: string;
}

type PagesFunction = (context: { request: Request }) => Response | Promise<Response>;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "cache-control": "public, max-age=60",
      ...init.headers,
    },
  });

const marketInfo = (symbol: string, exchange?: string): Pick<SearchCandidate, "market" | "marketLabel"> => {
  const upperSymbol = symbol.toUpperCase();
  const upperExchange = (exchange ?? "").toUpperCase();

  if (upperSymbol.endsWith(".SS") || upperSymbol.endsWith(".SZ") || ["SHH", "SHZ", "SHG", "SHE"].includes(upperExchange)) {
    return { market: "china_a", marketLabel: "中国A股" };
  }
  if (upperSymbol.endsWith(".HK") || ["HKG", "HKSE"].includes(upperExchange)) {
    return { market: "hongkong", marketLabel: "港股" };
  }
  if (upperSymbol.endsWith(".T") || ["JPX", "TYO", "OSA"].includes(upperExchange)) {
    return { market: "japan", marketLabel: "日本" };
  }
  if (["NMS", "NYQ", "ASE", "NGM", "NCM", "PCX"].includes(upperExchange)) {
    return { market: "us", marketLabel: "美国" };
  }

  return { market: "global", marketLabel: "全球" };
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const market = url.searchParams.get("market") as CountryCode | null;

  if (query.length < 2) return json({ results: [] });

  const yahooUrl = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  yahooUrl.searchParams.set("q", query);
  yahooUrl.searchParams.set("quotesCount", "12");
  yahooUrl.searchParams.set("newsCount", "0");
  yahooUrl.searchParams.set("enableFuzzyQuery", "true");

  const response = await fetch(yahooUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "web233-bi/1.0",
    },
  });

  if (!response.ok) {
    return json({ error: "company_search_failed", results: [] }, { status: 502 });
  }

  const payload = (await response.json()) as { quotes?: Array<Record<string, string>> };
  const results = (payload.quotes ?? [])
    .filter((quote) => quote.quoteType === "EQUITY" && quote.symbol)
    .map((quote): SearchCandidate => {
      const marketData = marketInfo(quote.symbol, quote.exchange);
      return {
        name: quote.longname || quote.shortname || quote.symbol,
        ticker: quote.symbol,
        ...marketData,
        sector: quote.sectorDisp || quote.sector || quote.industryDisp || quote.industry || "公开市场公司",
      };
    })
    .filter((candidate) => !market || market === "all" || candidate.market === market)
    .slice(0, 10);

  return json({ results });
};
