import "./styles.css";
import { companies, countries } from "./data/reports";
import { listedCompanyUniverse } from "./data/universe";
import { readPdfFile } from "./pdf";
import type { ListedCompanyCandidate } from "./data/universe";
import type {
  BreakdownCategory,
  Company,
  CountryCode,
  FinancialBreakdown,
  FinancialMetric,
  PdfAnalysis,
} from "./types";

type CountryFilter = CountryCode | "all";
type MetricKey = keyof Pick<
  FinancialMetric,
  "revenue" | "operatingIncome" | "netIncome" | "freeCashFlow" | "grossMargin" | "rdExpense"
>;

interface AppState {
  country: CountryFilter;
  query: string;
  companyId: string;
  dynamicCompanies: Company[];
  remoteMatches: ListedCompanyCandidate[];
  remoteBusy: boolean;
  remoteError?: string;
  loadingCompanyTicker?: string;
  pdfAnalysis?: PdfAnalysis;
  pdfPreviewUrl?: string;
  pdfError?: string;
  pdfBusy: boolean;
  intakeQuery?: string;
}

interface RenderOptions {
  restoreQueryFocus?: number;
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const state: AppState = {
  country: "all",
  query: "",
  companyId: companies[1]?.id ?? companies[0].id,
  dynamicCompanies: [],
  remoteMatches: [],
  remoteBusy: false,
  pdfBusy: false,
};

const metricLabels: Record<MetricKey, string> = {
  revenue: "营业收入",
  operatingIncome: "经营利润",
  netIncome: "净利润",
  freeCashFlow: "自由现金流",
  grossMargin: "毛利率",
  rdExpense: "研发费用",
};

const metricUnits: Record<MetricKey, string> = {
  revenue: "",
  operatingIncome: "",
  netIncome: "",
  freeCashFlow: "",
  grossMargin: "%",
  rdExpense: "",
};

const breakdownTitles: Record<BreakdownCategory, string> = {
  revenue: "收入来源",
  geography: "地区贡献",
  expense: "费用结构",
  cashflow: "自由现金流桥",
  profitBridge: "利润桥",
};

const confidenceLabels: Record<FinancialBreakdown["confidence"], string> = {
  audited: "披露",
  derived: "推导",
  estimated: "估算",
};

const currencyToUsdRates: Record<string, number> = {
  USD: 1,
  CNY: 0.138,
  HKD: 0.128,
  JPY: 0.0063,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  CHF: 1.11,
  TWD: 0.031,
  KRW: 0.00072,
  INR: 0.012,
  SGD: 0.74,
  SEK: 0.095,
  DKK: 0.145,
  NOK: 0.094,
  BRL: 0.18,
  MXN: 0.055,
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatValue = (value: number, suffix = "") =>
  `${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value)}${suffix}`;

const toRmbYi = (company: Company, value: number) => {
  const usdValue = value * (currencyToUsdRates[company.currency] ?? 1);
  const rmbValue = usdValue / currencyToUsdRates.CNY;
  return rmbValue * 10;
};

const formatRmbYi = (valueInYi: number, includeCurrency = true) => {
  const prefix = includeCurrency ? "RMB " : "";
  const absValue = Math.abs(valueInYi);
  if (absValue >= 10_000) return `${prefix}${formatValue(valueInYi / 10_000)} 万亿`;
  if (absValue >= 1) return `${prefix}${formatValue(valueInYi)} 亿`;
  return `${prefix}${formatValue(valueInYi * 10_000)} 万`;
};

const formatRmbAmount = (company: Company, value: number) => formatRmbYi(toRmbYi(company, value));

const latestMetric = (company: Company) =>
  [...company.metrics].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];

const earliestMetric = (company: Company) =>
  [...company.metrics].sort((a, b) => a.fiscalYear - b.fiscalYear)[0];

const getAllCompanies = () => [...companies, ...state.dynamicCompanies];

const getSelectedCompany = () =>
  getAllCompanies().find((company) => company.id === state.companyId) ?? companies[0];

const getFilteredCompanies = () =>
  getAllCompanies().filter((company) => {
    const matchesCountry = state.country === "all" || company.country === state.country;
    const query = state.query.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      [company.name, company.legalName, company.ticker, company.countryLabel]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesCountry && matchesQuery;
  });

const getUniverseMatches = () => {
  const query = state.query.trim().toLowerCase();
  if (query.length === 0) return [];
  const knownTickers = new Set(getAllCompanies().map((company) => company.ticker.toLowerCase()));

  return listedCompanyUniverse
    .filter((candidate) => {
      const matchesMarket = state.country === "all" || candidate.market === state.country;
      const matchesQuery = [candidate.name, candidate.ticker, candidate.marketLabel, candidate.sector]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return matchesMarket && matchesQuery && !knownTickers.has(candidate.ticker.toLowerCase());
    })
    .slice(0, 6);
};

let remoteSearchTimer: number | undefined;
let remoteSearchRequestId = 0;

const getRemoteMatches = () => {
  const knownTickers = new Set(getAllCompanies().map((company) => company.ticker.toLowerCase()));
  const localTickers = new Set(listedCompanyUniverse.map((company) => company.ticker.toLowerCase()));

  return state.remoteMatches
    .filter((candidate) => {
      const ticker = candidate.ticker.toLowerCase();
      const matchesMarket = state.country === "all" || candidate.market === state.country;
      return matchesMarket && !knownTickers.has(ticker) && !localTickers.has(ticker);
    })
    .slice(0, 8);
};

const requestRemoteSearch = (query: string) => {
  window.clearTimeout(remoteSearchTimer);

  if (query.trim().length < 2) {
    state.remoteMatches = [];
    state.remoteBusy = false;
    state.remoteError = undefined;
    return;
  }

  remoteSearchTimer = window.setTimeout(async () => {
    const requestId = ++remoteSearchRequestId;
    state.remoteBusy = true;
    state.remoteError = undefined;
    render({ restoreQueryFocus: document.querySelector<HTMLInputElement>("#company-query")?.selectionStart ?? query.length });

    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (state.country !== "all") params.set("market", state.country);
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) throw new Error(`搜索接口返回 ${response.status}`);
      const payload = (await response.json()) as { results?: ListedCompanyCandidate[] };
      if (requestId !== remoteSearchRequestId) return;
      state.remoteMatches = payload.results ?? [];
    } catch (error) {
      if (requestId !== remoteSearchRequestId) return;
      state.remoteMatches = [];
      state.remoteError = error instanceof Error ? error.message : "远程搜索失败。";
    } finally {
      if (requestId === remoteSearchRequestId) {
        state.remoteBusy = false;
        render({ restoreQueryFocus: document.querySelector<HTMLInputElement>("#company-query")?.selectionStart ?? query.length });
      }
    }
  }, 350);
};

const loadRemoteCompany = async (ticker: string) => {
  const normalizedTicker = ticker.trim();
  if (!normalizedTicker) return;

  const existing = getAllCompanies().find(
    (company) => company.ticker.toLowerCase() === normalizedTicker.toLowerCase(),
  );
  if (existing) {
    state.companyId = existing.id;
    state.query = existing.name;
    render();
    return;
  }

  state.loadingCompanyTicker = normalizedTicker;
  state.remoteError = undefined;
  render();

  try {
    const params = new URLSearchParams({ symbol: normalizedTicker });
    const response = await fetch(`/api/company?${params.toString()}`);
    if (!response.ok) throw new Error(`公司数据接口返回 ${response.status}`);
    const company = (await response.json()) as Company;

    state.dynamicCompanies = [
      ...state.dynamicCompanies.filter((item) => item.ticker.toLowerCase() !== company.ticker.toLowerCase()),
      company,
    ];
    state.companyId = company.id;
    state.query = company.name;
    state.intakeQuery = company.ticker;
    state.remoteMatches = [];
  } catch (error) {
    state.remoteError = error instanceof Error ? error.message : "公司数据加载失败。";
  } finally {
    state.loadingCompanyTicker = undefined;
    render();
  }
};

const calculateCagr = (start: number, end: number, years: number) => {
  if (start <= 0 || years <= 0) return 0;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
};

const downloadText = (fileName: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const metricRowsToCsv = (company: Company) => {
  const rows = [
    ["财年", "营业收入 RMB 亿", "经营利润 RMB 亿", "净利润 RMB 亿", "自由现金流 RMB 亿", "毛利率", "研发费用 RMB 亿"],
    ...company.metrics.map((metric) => [
      metric.fiscalYear,
      toRmbYi(company, metric.revenue).toFixed(2),
      toRmbYi(company, metric.operatingIncome).toFixed(2),
      toRmbYi(company, metric.netIncome).toFixed(2),
      toRmbYi(company, metric.freeCashFlow).toFixed(2),
      metric.grossMargin,
      toRmbYi(company, metric.rdExpense).toFixed(2),
    ]),
  ];

  return rows.map((row) => row.join(",")).join("\n");
};

const svgDownload = (company: Company) => {
  const svg = trendChart(company, "revenue", "netIncome", true);
  downloadText(`${company.id}-trend.svg`, svg, "image/svg+xml;charset=utf-8");
};

const analysisJson = (company: Company) =>
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      company,
      uploadedPdfAnalysis: state.pdfAnalysis ?? null,
    },
    null,
    2,
  );

const renderMetricCard = (
  title: string,
  value: string,
  helper: string,
  tone: "green" | "blue" | "purple" | "orange",
) => `
  <article class="metric-card metric-card--${tone}">
    <span>${title}</span>
    <strong>${value}</strong>
    <small>${helper}</small>
  </article>
`;

const getBreakdowns = (company: Company, category: BreakdownCategory) =>
  company.breakdowns.filter((item) => item.category === category);

const trendChart = (
  company: Company,
  primaryKey: MetricKey,
  secondaryKey: MetricKey,
  standalone = false,
) => {
  const width = 760;
  const height = 330;
  const padding = { top: 26, right: 58, bottom: 48, left: 58 };
  const metrics = [...company.metrics].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const convertMetric = (key: MetricKey, value: number) =>
    key === "grossMargin" ? value : toRmbYi(company, value);
  const primaryValues = metrics.map((metric) => convertMetric(primaryKey, metric[primaryKey] as number));
  const secondaryValues = metrics.map((metric) => convertMetric(secondaryKey, metric[secondaryKey] as number));
  const maxValue = Math.max(...primaryValues, ...secondaryValues, 1);
  const minValue = Math.min(...primaryValues, ...secondaryValues, 0);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const range = maxValue - minValue || 1;

  const x = (index: number) =>
    padding.left + (index / Math.max(metrics.length - 1, 1)) * chartWidth;
  const y = (value: number) =>
    padding.top + (1 - (value - minValue) / range) * chartHeight;
  const path = (values: number[]) =>
    values
      .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
      .join(" ");
  const grid = Array.from({ length: 5 }, (_, index) => {
    const lineY = padding.top + (index / 4) * chartHeight;
    const value = maxValue - (index / 4) * range;
    return `
      <line x1="${padding.left}" y1="${lineY}" x2="${width - padding.right}" y2="${lineY}" />
      <text x="${padding.left - 12}" y="${lineY + 4}" text-anchor="end">${formatRmbYi(value, false)}</text>
    `;
  }).join("");

  const years = metrics
    .map(
      (metric, index) => `
        <text x="${x(index)}" y="${height - 18}" text-anchor="middle">${metric.fiscalYear}</text>
      `,
    )
    .join("");

  return `
    <svg ${standalone ? 'xmlns="http://www.w3.org/2000/svg"' : ""} class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(company.name)} ${escapeHtml(metricLabels[primaryKey])} 趋势">
      <rect width="${width}" height="${height}" rx="8" fill="#ffffff" />
      <g class="chart-grid">${grid}</g>
      <g class="chart-axis">
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" />
        ${years}
      </g>
      <path d="${path(primaryValues)}" fill="none" stroke="#059669" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${path(secondaryValues)}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${primaryValues
        .map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="#059669"><title>${metricLabels[primaryKey]} ${formatRmbYi(value)}</title></circle>`)
        .join("")}
      ${secondaryValues
        .map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="#2563eb"><title>${metricLabels[secondaryKey]} ${formatRmbYi(value)}</title></circle>`)
        .join("")}
      <g class="chart-legend">
        <circle cx="610" cy="30" r="5" fill="#059669" />
        <text x="622" y="35">${metricLabels[primaryKey]}</text>
        <circle cx="610" cy="56" r="5" fill="#2563eb" />
        <text x="622" y="61">${metricLabels[secondaryKey]}</text>
      </g>
    </svg>
  `.trim();
};

const segmentChart = (company: Company) => {
  const total = company.segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return `
    <div class="segment-list">
      ${company.segments
        .map((segment) => {
          const width = Math.max((segment.value / total) * 100, 4);
          return `
            <div class="segment-row">
              <div>
                <span>${escapeHtml(segment.name)}</span>
                <small>${formatRmbAmount(company, segment.value)}</small>
              </div>
              <div class="segment-track" aria-hidden="true">
                <i style="width: ${width}%"></i>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
};

const breakdownList = (company: Company, category: BreakdownCategory, limit?: number) => {
  const latest = latestMetric(company);
  const rows = getBreakdowns(company, category).slice(0, limit);
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return `
    <div class="breakdown-list breakdown-list--${category}">
      ${rows
        .map((row) => {
          const width = Math.max((Math.abs(row.value) / max) * 100, 4);
          const valueClass = row.value < 0 ? "is-negative" : "";
          return `
            <article class="breakdown-row">
              <div class="breakdown-main">
                <div>
                  <strong>${escapeHtml(row.label)}</strong>
                  <small>${escapeHtml(row.sourceLabel)} · ${confidenceLabels[row.confidence]}</small>
                </div>
                <span class="${valueClass}">
                  ${formatRmbAmount(company, row.value)}
                </span>
              </div>
              <div class="breakdown-bar" aria-hidden="true">
                <i class="${valueClass}" style="width: ${width}%"></i>
              </div>
              <p>${escapeHtml(row.note)} ${row.percentOfRevenue === undefined ? "" : `占收入 ${formatValue(row.percentOfRevenue, "%")}。`}</p>
            </article>
          `;
        })
        .join("")}
      <div class="reconcile-note">
        <span>${latest.fiscalYear}</span>
        <strong>${breakdownTitles[category]}</strong>
      </div>
    </div>
  `;
};

const profitBridge = (company: Company) => {
  const rows = getBreakdowns(company, "profitBridge");

  return `
    <div class="bridge-track">
      ${rows
        .map(
          (row) => `
            <article>
              <span>${escapeHtml(row.label)}</span>
              <strong>${formatRmbAmount(company, row.value)}</strong>
              <small>${formatValue(row.percentOfRevenue ?? 0, "%")} of revenue</small>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
};

const citationRail = (company: Company) => `
  <div class="citation-rail">
    ${company.citations
      .map(
        (citation) => `
          <a href="${citation.url}" target="_blank" rel="noreferrer">
            <span>${confidenceLabels[citation.confidence]}</span>
            <strong>${escapeHtml(citation.label)}</strong>
            <small>${escapeHtml(citation.scope)}</small>
          </a>
        `,
      )
      .join("")}
  </div>
`;

const deepDivePanel = (company: Company) => `
  <section class="panel deep-panel" id="breakdown" aria-labelledby="breakdown-title">
    <div class="section-heading section-heading--wide">
      <div>
        <h2 id="breakdown-title">业务与财务细节拆解</h2>
        <p>把总收入、利润、费用和现金流拆回业务线、地区和报表行项目，所有数字都带来源与置信度。</p>
      </div>
      <div class="source-score">
        <span>Source confidence</span>
        <strong>${company.citations.filter((item) => item.confidence === "audited").length}/${company.citations.length}</strong>
      </div>
    </div>
    <div class="deep-grid">
      <section>
        <h3>收入由哪些业务提供</h3>
        ${breakdownList(company, "revenue")}
      </section>
      <section>
        <h3>地区贡献</h3>
        ${breakdownList(company, "geography")}
      </section>
      <section>
        <h3>费用结构</h3>
        ${breakdownList(company, "expense")}
      </section>
      <section>
        <h3>现金流桥</h3>
        ${breakdownList(company, "cashflow")}
      </section>
    </div>
    <div class="profit-source-grid">
      <section>
        <h3>利润桥</h3>
        ${profitBridge(company)}
      </section>
      <section>
        <h3>引用与来源</h3>
        ${citationRail(company)}
      </section>
    </div>
  </section>
`;

const getIngestRoutes = (query: string) => {
  const normalized = query.trim();
  const upper = normalized.toUpperCase();
  const isHongKong = /\.HK$/i.test(upper) || (state.country === "hongkong" && /^\d{4,5}$/.test(normalized));
  const isChinaA = /\.(SS|SH|SZ)$/i.test(upper) || (state.country === "china_a" && /^\d{6}$/.test(normalized));
  const selectedMarket = countries.find((country) => country.code === state.country)?.label;
  const marketHint = isChinaA ? "中国A股" : isHongKong ? "港股" : selectedMarket ?? "自动识别";

  return [
    {
      label: "SEC / EDGAR",
      market: "美国与 ADR",
      status: state.country === "us" || state.country === "all" ? "优先" : "备用",
      detail: "10-K、20-F、8-K、XBRL Companyfacts，适合自动拆利润表、现金流与分部。",
      href: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(normalized)}&category=form-cat1`,
    },
    {
      label: "CNINFO + SSE/SZSE",
      market: "中国A股",
      status: isChinaA || state.country === "china_a" ? "优先" : "备用",
      detail: "年报、半年报、招股书和交易所公告，A股与港股分开建索引。",
      href: `http://www.cninfo.com.cn/new/fulltextSearch?notautosubmit=&keyWord=${encodeURIComponent(normalized)}`,
    },
    {
      label: "HKEXnews",
      market: "港股",
      status: isHongKong || state.country === "hongkong" ? "优先" : "备用",
      detail: "Annual Report、Interim Report、公告 PDF，按港股代码单独归档。",
      href: "https://www1.hkexnews.hk/search/titlesearch.xhtml?lang=zh",
    },
    {
      label: "Company IR",
      market: marketHint,
      status: "补源",
      detail: "公司投资者关系页用于补齐 PDF、业务介绍、口径变化和管理层讨论。",
      href: `https://www.google.com/search?q=${encodeURIComponent(`${normalized} investor relations annual report`)}`,
    },
  ];
};

const autoIngestPanel = (company: Company) => {
  const intakeQuery = state.intakeQuery ?? state.query.trim() ?? company.ticker;
  const visibleQuery = intakeQuery.length > 0 ? intakeQuery : company.ticker;
  const routes = getIngestRoutes(visibleQuery);

  return `
    <section class="panel ingest-panel" id="ingest" aria-labelledby="ingest-title">
      <div class="section-heading section-heading--wide">
        <div>
          <h2 id="ingest-title">联网查看任意公司</h2>
          <p>输入上市公司名称或代码后，会先搜索公开市场结果，再拉取年度财务数据并生成可浏览的分析页。</p>
        </div>
        <button class="ghost-button" type="button">数据路线</button>
      </div>
      <div class="ingest-flow">
        <article>
          <span>01</span>
          <strong>识别公司</strong>
          <small>Ticker / CIK / A股代码 / HKEX code</small>
        </article>
        <article>
          <span>02</span>
          <strong>拉取指标</strong>
          <small>年度收入、利润、现金流、研发费用</small>
        </article>
        <article>
          <span>03</span>
          <strong>拆分业务来源</strong>
          <small>分部、地区、费用、现金流桥</small>
        </article>
        <article>
          <span>04</span>
          <strong>统一人民币口径</strong>
          <small>原币保留，图表统一折算为 RMB 万 / 亿</small>
        </article>
      </div>
      <div class="source-route-grid" aria-label="官方披露源路线">
        ${routes
          .map(
            (route) => `
              <a class="source-route" href="${route.href}" target="_blank" rel="noreferrer">
                <span>${escapeHtml(route.status)}</span>
                <strong>${escapeHtml(route.label)}</strong>
                <small>${escapeHtml(route.market)}</small>
                <p>${escapeHtml(route.detail)}</p>
              </a>
            `,
          )
          .join("")}
      </div>
      <div class="ingest-preview">
        <input value="${escapeHtml(visibleQuery)}" aria-label="公司代码示例" />
        <button type="button">联网查看</button>
        <span>${
          state.intakeQuery
            ? `已加载「${escapeHtml(state.intakeQuery)}」的公司页；缺失指标会以估算字段标注。`
            : "在左侧搜索框输入公司名或股票代码即可联网查看。"
        }</span>
      </div>
    </section>
  `;
};

const reportsTable = (company: Company) => `
  <section class="panel archive-panel" aria-labelledby="archive-title">
    <div class="section-heading">
      <div>
        <h2 id="archive-title">年报归档（近 10 年）</h2>
        <p>${escapeHtml(company.name)} 财报 PDF 链接与来源页，适合快速回溯原文。</p>
      </div>
      <a class="ghost-link" href="${company.investorRelationsUrl}" target="_blank" rel="noreferrer">投资者关系</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>财年</th>
            <th>标题</th>
            <th>链接类型</th>
            <th>PDF / 来源</th>
            <th>下载</th>
          </tr>
        </thead>
        <tbody>
          ${company.reports
            .map(
              (report) => `
                <tr>
                  <td>${report.fiscalYear}</td>
                  <td>${escapeHtml(report.title)}</td>
                  <td><span class="status status--${report.status}">${report.status === "verified" ? "已校验" : report.status === "source-page" ? "来源页" : "种子链接"}</span></td>
                  <td>
                    <a href="${report.pdfUrl}" target="_blank" rel="noreferrer">${escapeHtml(report.sourceName)}</a>
                    <small>${escapeHtml(new URL(report.sourceUrl).hostname)}</small>
                  </td>
                  <td>
                    <a class="icon-link" href="${report.pdfUrl}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(report.title)}">打开</a>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </section>
`;

const pdfPanel = () => {
  const analysis = state.pdfAnalysis;
  return `
    <aside class="pdf-panel panel" aria-labelledby="pdf-title">
      <div class="section-heading">
        <div>
          <h2 id="pdf-title">PDF 分析</h2>
          <p>上传财报 PDF 后在浏览器端渲染预览，并尝试提取关键数字。</p>
        </div>
      </div>
      <label class="dropzone ${state.pdfBusy ? "is-busy" : ""}" for="pdf-file">
        <input id="pdf-file" type="file" accept="application/pdf" ${state.pdfBusy ? "disabled" : ""} />
        <strong>${state.pdfBusy ? "正在解析 PDF..." : "上传年报 PDF"}</strong>
        <span>支持本地 PDF，文本只在浏览器内处理。</span>
      </label>
      ${state.pdfError ? `<p class="error-text">${escapeHtml(state.pdfError)}</p>` : ""}
      ${
        analysis
          ? `
            <div class="pdf-result">
              <div class="file-row">
                <strong>${escapeHtml(analysis.fileName)}</strong>
                <span>${analysis.pages} 页</span>
              </div>
              ${
                state.pdfPreviewUrl
                  ? `<img class="pdf-preview" src="${state.pdfPreviewUrl}" alt="${escapeHtml(analysis.fileName)} 首页预览" />`
                  : ""
              }
              <h3>提取结果</h3>
              <div class="extract-list">
                ${analysis.extracted
                  .map(
                    (metric) => `
                      <div>
                        <span>${escapeHtml(metric.label)}</span>
                        <strong>${escapeHtml(metric.value)}</strong>
                        <small>${metric.confidence}</small>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
              <details>
                <summary>查看文本片段</summary>
                <p>${escapeHtml(analysis.textSample)}</p>
              </details>
            </div>
          `
          : `<div class="empty-state">还没有上传文件。可以先使用内置公司数据查看图表与归档。</div>`
      }
    </aside>
  `;
};

const sidebar = (selectedCompany: Company) => {
  const filteredCompanies = getFilteredCompanies();
  const universeMatches = getUniverseMatches();
  const remoteMatches = getRemoteMatches();
  const query = state.query.trim();
  const hasExactMatch = filteredCompanies.some(
    (company) =>
      company.name.toLowerCase() === query.toLowerCase() ||
      company.ticker.toLowerCase() === query.toLowerCase() ||
      company.legalName.toLowerCase() === query.toLowerCase(),
  );
  const hasVisibleMatch = filteredCompanies.length > 0;

  return `
    <aside class="sidebar" aria-label="筛选">
      <div class="brand">
        <span class="brand-mark">BI</span>
        <div>
          <strong>neko233-BI</strong>
          <small>Financial intelligence</small>
        </div>
      </div>
      <div class="filter-group">
        <label>市场 / 国家</label>
        <div class="country-tabs">
          ${countries
            .map(
              (country) => `
                <button class="${state.country === country.code ? "is-active" : ""}" data-country="${country.code}">
                  ${escapeHtml(country.label)}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="filter-group">
        <label for="company-query">公司</label>
        <input id="company-query" type="search" value="${escapeHtml(state.query)}" placeholder="搜索公司名称或代码" />
      </div>
      <div class="company-list">
        ${filteredCompanies
          .map(
            (company) => `
              <button class="company-item ${company.id === selectedCompany.id ? "is-active" : ""}" data-company="${company.id}">
                <span>${company.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>${escapeHtml(company.name)}</strong>
                  <small>${escapeHtml(company.ticker)} · ${escapeHtml(company.countryLabel)}</small>
                </div>
              </button>
            `,
          )
          .join("")}
      </div>
      ${
        universeMatches.length > 0
          ? `
            <div class="universe-list">
              ${universeMatches
                .map(
                  (candidate) => `
                    <button class="company-intake" data-load-company="${escapeHtml(candidate.ticker)}">
                      <span>${state.loadingCompanyTicker === candidate.ticker ? "..." : "↗"}</span>
                      <div>
                        <strong>${escapeHtml(candidate.name)}</strong>
                        <small>查看 ${escapeHtml(candidate.ticker)} · ${escapeHtml(candidate.marketLabel)} · ${escapeHtml(candidate.sector)}</small>
                      </div>
                    </button>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        remoteMatches.length > 0
          ? `
            <div class="universe-list">
              ${remoteMatches
                .map(
                  (candidate) => `
                    <button class="company-intake" data-load-company="${escapeHtml(candidate.ticker)}">
                      <span>${state.loadingCompanyTicker === candidate.ticker ? "..." : "↗"}</span>
                      <div>
                        <strong>${escapeHtml(candidate.name)}</strong>
                        <small>联网查看 ${escapeHtml(candidate.ticker)} · ${escapeHtml(candidate.marketLabel)} · ${escapeHtml(candidate.sector)}</small>
                      </div>
                    </button>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${state.remoteBusy ? `<div class="sidebar-status">正在搜索更多公司...</div>` : ""}
      ${state.remoteError ? `<div class="sidebar-status sidebar-status--error">${escapeHtml(state.remoteError)}</div>` : ""}
      ${
        query.length > 0 && !hasExactMatch && !hasVisibleMatch && universeMatches.length === 0 && remoteMatches.length === 0 && !state.remoteBusy
          ? `
            <button class="company-intake" data-load-company="${escapeHtml(query)}">
              <span>${state.loadingCompanyTicker === query ? "..." : "↗"}</span>
              <div>
                <strong>联网查找「${escapeHtml(query)}」</strong>
                <small>支持任意公司名 / 股票代码，无需手动添加</small>
              </div>
            </button>
          `
          : ""
      }
      <div class="filter-note">
        <strong>研究模式</strong>
        <p>按来源拆分收入、利润、费用与现金流，低置信度字段会显式标注，不把推导当事实。</p>
      </div>
    </aside>
  `;
};

const companyOverview = (company: Company) => {
  const latest = latestMetric(company);
  const earliest = earliestMetric(company);
  const years = latest.fiscalYear - earliest.fiscalYear;
  const revenueCagr = calculateCagr(earliest.revenue, latest.revenue, years);
  const profitCagr = calculateCagr(Math.max(earliest.netIncome, 0.1), latest.netIncome, years);

  return `
    <main class="workspace">
      <header class="topbar">
        <nav>
          <a href="#analysis" class="is-active">财务分析</a>
          <a href="#breakdown">业务拆解</a>
          <a href="#archive">PDF 归档</a>
          <a href="#ingest">联网查看</a>
        </nav>
        <div class="actions">
          <button data-action="download-json">下载分析包</button>
          <button data-action="download-csv">下载 CSV</button>
        </div>
      </header>
      <section class="company-header">
        <div>
          <h1>${escapeHtml(company.name)} <span>${escapeHtml(company.ticker)}</span></h1>
          <p>${escapeHtml(company.legalName)} · ${escapeHtml(company.countryLabel)} · 财年结束：${escapeHtml(company.fiscalYearEnd)}</p>
        </div>
        <div class="header-stat">
          <span>${latest.fiscalYear} 收入</span>
          <strong>${formatRmbAmount(company, latest.revenue)}</strong>
          <small>已按 ${escapeHtml(company.currency)} 折算为 RMB；${escapeHtml(company.exchangeHint)}</small>
        </div>
      </section>
      <section class="analysis-grid" id="analysis">
        <section class="panel chart-panel">
          <div class="section-heading">
            <div>
              <h2>核心财务趋势</h2>
              <p>${earliest.fiscalYear}-${latest.fiscalYear}，统一展示为 RMB 万 / 亿。原始披露币种：${escapeHtml(company.currency)}。</p>
            </div>
            <button class="ghost-button" data-action="download-svg">下载 SVG</button>
          </div>
          <div class="metric-strip">
            ${renderMetricCard("营业收入", formatRmbAmount(company, latest.revenue), `CAGR ${formatValue(revenueCagr, "%")}`, "green")}
            ${renderMetricCard("净利润", formatRmbAmount(company, latest.netIncome), `CAGR ${formatValue(profitCagr, "%")}`, "blue")}
            ${renderMetricCard("毛利率", formatValue(latest.grossMargin, "%"), "最新财年", "purple")}
            ${renderMetricCard("研发费用", formatRmbAmount(company, latest.rdExpense), "创新投入", "orange")}
          </div>
          <div class="chart-shell">
            ${trendChart(company, "revenue", "netIncome")}
          </div>
        </section>
        <section class="panel insight-panel">
          <div class="section-heading">
            <div>
              <h2>业务来源摘要</h2>
              <p>按最近披露年度的主要分部整理，辅助定位增长来源。</p>
            </div>
          </div>
          ${segmentChart(company)}
          <div class="watch-list">
            <h3>阅读重点</h3>
            ${company.watchItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        </section>
      </section>
      ${deepDivePanel(company)}
      ${autoIngestPanel(company)}
      <div id="archive">${reportsTable(company)}</div>
    </main>
  `;
};

const render = (options: RenderOptions = {}) => {
  const filtered = getFilteredCompanies();
  if (!filtered.some((company) => company.id === state.companyId)) {
    state.companyId = filtered[0]?.id ?? companies[0].id;
  }

  const selectedCompany = getSelectedCompany();
  app.innerHTML = `
    <div class="app-shell">
      ${sidebar(selectedCompany)}
      <div class="content-shell">
        ${companyOverview(selectedCompany)}
        <div id="upload">${pdfPanel()}</div>
      </div>
    </div>
  `;

  bindEvents(selectedCompany);

  if (options.restoreQueryFocus !== undefined) {
    const queryInput = document.querySelector<HTMLInputElement>("#company-query");
    if (queryInput) {
      queryInput.focus();
      const cursor = Math.min(options.restoreQueryFocus, queryInput.value.length);
      queryInput.setSelectionRange(cursor, cursor);
    }
  }
};

const bindEvents = (company: Company) => {
  document.querySelectorAll<HTMLButtonElement>("[data-country]").forEach((button) => {
    button.addEventListener("click", () => {
      state.country = button.dataset.country as CountryFilter;
      requestRemoteSearch(state.query);
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-company]").forEach((button) => {
    button.addEventListener("click", () => {
      state.companyId = button.dataset.company ?? company.id;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-load-company]").forEach((button) => {
    button.addEventListener("click", () => {
      void loadRemoteCompany(button.dataset.loadCompany ?? state.query.trim());
    });
  });

  document.querySelector<HTMLInputElement>("#company-query")?.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    state.query = target.value;
    requestRemoteSearch(target.value);
    render({ restoreQueryFocus: target.selectionStart ?? target.value.length });
  });

  document.querySelector<HTMLInputElement>("#pdf-file")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    state.pdfBusy = true;
    state.pdfError = undefined;
    render();

    try {
      const result = await readPdfFile(file);
      state.pdfAnalysis = result.analysis;
      state.pdfPreviewUrl = result.previewUrl;
    } catch (error) {
      state.pdfError = error instanceof Error ? error.message : "PDF 解析失败。";
    } finally {
      state.pdfBusy = false;
      render();
    }
  });

  document.querySelector<HTMLButtonElement>('[data-action="download-json"]')?.addEventListener("click", () => {
    downloadText(`${company.id}-analysis.json`, analysisJson(company), "application/json;charset=utf-8");
  });

  document.querySelector<HTMLButtonElement>('[data-action="download-csv"]')?.addEventListener("click", () => {
    downloadText(`${company.id}-metrics.csv`, metricRowsToCsv(company), "text/csv;charset=utf-8");
  });

  document.querySelector<HTMLButtonElement>('[data-action="download-svg"]')?.addEventListener("click", () => {
    svgDownload(company);
  });
};

render();
