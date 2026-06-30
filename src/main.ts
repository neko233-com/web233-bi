import "./styles.css";
import { companies, countries } from "./data/reports";
import { readPdfFile } from "./pdf";
import type { Company, CountryCode, FinancialMetric, PdfAnalysis } from "./types";

type CountryFilter = CountryCode | "all";
type MetricKey = keyof Pick<
  FinancialMetric,
  "revenue" | "operatingIncome" | "netIncome" | "freeCashFlow" | "grossMargin" | "rdExpense"
>;

interface AppState {
  country: CountryFilter;
  query: string;
  companyId: string;
  pdfAnalysis?: PdfAnalysis;
  pdfPreviewUrl?: string;
  pdfError?: string;
  pdfBusy: boolean;
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const state: AppState = {
  country: "all",
  query: "",
  companyId: companies[1]?.id ?? companies[0].id,
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

const latestMetric = (company: Company) =>
  [...company.metrics].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];

const earliestMetric = (company: Company) =>
  [...company.metrics].sort((a, b) => a.fiscalYear - b.fiscalYear)[0];

const getSelectedCompany = () =>
  companies.find((company) => company.id === state.companyId) ?? companies[0];

const getFilteredCompanies = () =>
  companies.filter((company) => {
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
    ["Fiscal year", "Revenue", "Operating income", "Net income", "Free cash flow", "Gross margin", "R&D expense"],
    ...company.metrics.map((metric) => [
      metric.fiscalYear,
      metric.revenue,
      metric.operatingIncome,
      metric.netIncome,
      metric.freeCashFlow,
      metric.grossMargin,
      metric.rdExpense,
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
  const primaryValues = metrics.map((metric) => metric[primaryKey] as number);
  const secondaryValues = metrics.map((metric) => metric[secondaryKey] as number);
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
      <text x="${padding.left - 12}" y="${lineY + 4}" text-anchor="end">${formatValue(value)}</text>
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
        .map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="#059669"><title>${metricLabels[primaryKey]} ${formatValue(value)}</title></circle>`)
        .join("")}
      ${secondaryValues
        .map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="#2563eb"><title>${metricLabels[secondaryKey]} ${formatValue(value)}</title></circle>`)
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
                <small>${formatValue(segment.value)} ${company.unit}</small>
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

  return `
    <aside class="sidebar" aria-label="筛选">
      <div class="brand">
        <span class="brand-mark">BI</span>
        <div>
          <strong>neko233-BI</strong>
          <small>财报阅读工作台</small>
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
      <div class="filter-note">
        <strong>收录策略</strong>
        <p>先用静态数据覆盖科技、游戏、平台与半导体公司，后续可接入定时任务校验 PDF 可用性。</p>
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
          <a href="#archive">PDF 归档</a>
          <a href="#upload">上传解析</a>
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
          <strong>${formatValue(latest.revenue)} ${company.unit}</strong>
          <small>${escapeHtml(company.exchangeHint)}</small>
        </div>
      </section>
      <section class="analysis-grid" id="analysis">
        <section class="panel chart-panel">
          <div class="section-heading">
            <div>
              <h2>核心财务趋势</h2>
              <p>${earliest.fiscalYear}-${latest.fiscalYear}，单位：${escapeHtml(company.unit)}，币种：${escapeHtml(company.currency)}。</p>
            </div>
            <button class="ghost-button" data-action="download-svg">下载 SVG</button>
          </div>
          <div class="metric-strip">
            ${renderMetricCard("营业收入", `${formatValue(latest.revenue)} ${company.unit}`, `CAGR ${formatValue(revenueCagr, "%")}`, "green")}
            ${renderMetricCard("净利润", `${formatValue(latest.netIncome)} ${company.unit}`, `CAGR ${formatValue(profitCagr, "%")}`, "blue")}
            ${renderMetricCard("毛利率", formatValue(latest.grossMargin, "%"), "最新财年", "purple")}
            ${renderMetricCard("研发费用", `${formatValue(latest.rdExpense)} ${company.unit}`, "创新投入", "orange")}
          </div>
          <div class="chart-shell">
            ${trendChart(company, "revenue", "netIncome")}
          </div>
        </section>
        <section class="panel insight-panel">
          <div class="section-heading">
            <div>
              <h2>业务结构</h2>
              <p>按最近披露年度的主要分部整理。</p>
            </div>
          </div>
          ${segmentChart(company)}
          <div class="watch-list">
            <h3>阅读重点</h3>
            ${company.watchItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        </section>
      </section>
      <div id="archive">${reportsTable(company)}</div>
    </main>
  `;
};

const render = () => {
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
};

const bindEvents = (company: Company) => {
  document.querySelectorAll<HTMLButtonElement>("[data-country]").forEach((button) => {
    button.addEventListener("click", () => {
      state.country = button.dataset.country as CountryFilter;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-company]").forEach((button) => {
    button.addEventListener("click", () => {
      state.companyId = button.dataset.company ?? company.id;
      render();
    });
  });

  document.querySelector<HTMLInputElement>("#company-query")?.addEventListener("input", (event) => {
    state.query = (event.target as HTMLInputElement).value;
    render();
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
