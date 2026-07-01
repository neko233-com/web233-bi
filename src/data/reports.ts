import type {
  Company,
  CountryCode,
  FinancialBreakdown,
  ReportLink,
  SegmentValue,
  SourceCitation,
} from "../types";

type CompanySeed = Omit<Company, "geography" | "breakdowns" | "citations"> &
  Partial<Pick<Company, "geography" | "breakdowns" | "citations">>;

const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];

const annualReports = (
  folder: string,
  archiveTicker: string,
  sourceUrl: string,
  status: ReportLink["status"] = "seeded",
): ReportLink[] =>
  YEARS.map((year) => ({
    fiscalYear: year,
    title: `FY${year} Annual Report`,
    pdfUrl: `https://www.annualreports.com/HostedData/AnnualReportArchive/${folder}/${archiveTicker}_${year}.pdf`,
    sourceName: status === "verified" ? "AnnualReports PDF" : "Seed PDF link",
    sourceUrl,
    status,
  }));

const sourcePageReports = (
  sourceName: string,
  sourceUrl: string,
): ReportLink[] =>
  YEARS.map((year) => ({
    fiscalYear: year,
    title: `FY${year} Annual Report Archive`,
    pdfUrl: sourceUrl,
    sourceName,
    sourceUrl,
    status: "source-page",
  }));

export const countries: Array<{ code: CountryCode | "all"; label: string }> = [
  { code: "all", label: "全部" },
  { code: "us", label: "美国" },
  { code: "china_a", label: "中国A股" },
  { code: "hongkong", label: "港股" },
  { code: "japan", label: "日本" },
];

const latestMetric = (company: CompanySeed) =>
  [...company.metrics].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];

const rounded = (value: number) => Number(value.toFixed(Math.abs(value) >= 100 ? 0 : 1));

const defaultGeography = (country: CountryCode, revenue: number): SegmentValue[] => {
  const sharesByCountry: Record<CountryCode, Array<{ name: string; share: number }>> = {
    us: [
      { name: "Americas", share: 0.43 },
      { name: "EMEA", share: 0.25 },
      { name: "Greater China", share: 0.17 },
      { name: "Japan", share: 0.07 },
      { name: "Rest of APAC", share: 0.08 },
    ],
    china_a: [
      { name: "Mainland China", share: 0.92 },
      { name: "International", share: 0.05 },
      { name: "Other", share: 0.03 },
    ],
    hongkong: [
      { name: "Mainland China", share: 0.54 },
      { name: "Hong Kong / Macau", share: 0.08 },
      { name: "International", share: 0.28 },
      { name: "Other Asia", share: 0.1 },
    ],
    japan: [
      { name: "Japan", share: 0.34 },
      { name: "Americas", share: 0.32 },
      { name: "Europe", share: 0.23 },
      { name: "Other", share: 0.11 },
    ],
  };

  return sharesByCountry[country].map((item) => ({
    name: item.name,
    value: rounded(revenue * item.share),
  }));
};

const makeCitations = (company: CompanySeed): SourceCitation[] => [
  {
    label: "Annual report archive",
    url: company.reports[0]?.sourceUrl ?? company.investorRelationsUrl,
    scope: "年报 PDF / 来源页",
    confidence: company.reports.some((report) => report.status === "verified") ? "audited" : "derived",
  },
  {
    label: "Investor relations",
    url: company.investorRelationsUrl,
    scope: "业务分部、财报口径、披露说明",
    confidence: "audited",
  },
];

const makeBreakdowns = (company: CompanySeed, geography: SegmentValue[]): FinancialBreakdown[] => {
  const latest = latestMetric(company);
  const sourceUrl = company.reports[0]?.sourceUrl ?? company.investorRelationsUrl;
  const grossProfit = rounded(latest.revenue * (latest.grossMargin / 100));
  const operatingExpense = rounded(Math.max(grossProfit - latest.operatingIncome, 0));
  const otherOpex = rounded(Math.max(operatingExpense - latest.rdExpense, 0));
  const reinvestmentGap = rounded(latest.freeCashFlow - latest.netIncome);

  const revenueSources: FinancialBreakdown[] = company.segments.map((segment) => ({
    category: "revenue",
    label: segment.name,
    value: segment.value,
    percentOfRevenue: rounded((segment.value / latest.revenue) * 100),
    sourceLabel: "业务分部披露",
    sourceUrl,
    confidence: "audited",
    note: "来自公司年报的主要收入分部，适合判断增长由哪些业务线贡献。",
  }));

  const geographySources: FinancialBreakdown[] = geography.map((segment) => ({
    category: "geography",
    label: segment.name,
    value: segment.value,
    percentOfRevenue: rounded((segment.value / latest.revenue) * 100),
    sourceLabel: "地区口径映射",
    sourceUrl,
    confidence: "derived",
    note: "用于产品演示的地区收入拆分，正式版本应回填年报地区披露。",
  }));

  const expenseSources: FinancialBreakdown[] = [
    {
      category: "expense",
      label: "R&D",
      value: latest.rdExpense,
      percentOfRevenue: rounded((latest.rdExpense / latest.revenue) * 100),
      sourceLabel: "研发费用行项目",
      sourceUrl,
      confidence: "audited",
      note: "研发投入强度，用于观察 AI、云、游戏内容或芯片迭代的投入节奏。",
    },
    {
      category: "expense",
      label: "Sales / Admin / Other Opex",
      value: otherOpex,
      percentOfRevenue: rounded((otherOpex / latest.revenue) * 100),
      sourceLabel: "毛利 - 经营利润 - 研发费用",
      sourceUrl,
      confidence: "derived",
      note: "从披露行项目推导的其他经营费用，适合看运营杠杆变化。",
    },
  ];

  const cashflowSources: FinancialBreakdown[] = [
    {
      category: "cashflow",
      label: "Net income",
      value: latest.netIncome,
      percentOfRevenue: rounded((latest.netIncome / latest.revenue) * 100),
      sourceLabel: "利润表",
      sourceUrl,
      confidence: "audited",
      note: "净利润是自由现金流桥的起点。",
    },
    {
      category: "cashflow",
      label: "Working capital / Capex bridge",
      value: reinvestmentGap,
      percentOfRevenue: rounded((reinvestmentGap / latest.revenue) * 100),
      sourceLabel: "FCF - Net income",
      sourceUrl,
      confidence: "derived",
      note: "自由现金流与净利润的差额，提示资本开支、营运资本和非现金项目影响。",
    },
    {
      category: "cashflow",
      label: "Free cash flow",
      value: latest.freeCashFlow,
      percentOfRevenue: rounded((latest.freeCashFlow / latest.revenue) * 100),
      sourceLabel: "现金流量表",
      sourceUrl,
      confidence: "audited",
      note: "衡量可回购、分红、再投资的真实现金生成能力。",
    },
  ];

  const profitBridge: FinancialBreakdown[] = [
    {
      category: "profitBridge",
      label: "Revenue",
      value: latest.revenue,
      percentOfRevenue: 100,
      sourceLabel: "收入行项目",
      sourceUrl,
      confidence: "audited",
      note: "全部业务收入基准。",
    },
    {
      category: "profitBridge",
      label: "Gross profit",
      value: grossProfit,
      percentOfRevenue: latest.grossMargin,
      sourceLabel: "收入 × 毛利率",
      sourceUrl,
      confidence: "derived",
      note: "产品组合、云服务、软件订阅和硬件周期会影响这一层。",
    },
    {
      category: "profitBridge",
      label: "Operating income",
      value: latest.operatingIncome,
      percentOfRevenue: rounded((latest.operatingIncome / latest.revenue) * 100),
      sourceLabel: "经营利润行项目",
      sourceUrl,
      confidence: "audited",
      note: "扣除经营费用后的业务盈利能力。",
    },
    {
      category: "profitBridge",
      label: "Net income",
      value: latest.netIncome,
      percentOfRevenue: rounded((latest.netIncome / latest.revenue) * 100),
      sourceLabel: "净利润行项目",
      sourceUrl,
      confidence: "audited",
      note: "最终归属股东的盈利。",
    },
  ];

  return [...revenueSources, ...geographySources, ...expenseSources, ...cashflowSources, ...profitBridge];
};

const completeCompany = (company: CompanySeed): Company => {
  const latest = latestMetric(company);
  const geography = company.geography ?? defaultGeography(company.country, latest.revenue);

  return {
    ...company,
    geography,
    citations: company.citations ?? makeCitations(company),
    breakdowns: company.breakdowns ?? makeBreakdowns(company, geography),
  };
};

const companySeeds: CompanySeed[] = [
  {
    id: "apple",
    name: "Apple",
    legalName: "Apple Inc.",
    ticker: "AAPL",
    country: "us",
    countryLabel: "美国",
    currency: "USD",
    unit: "十亿美元",
    exchangeHint: "数据以 Apple 财年披露口径整理。",
    kinds: ["tech", "platform"],
    fiscalYearEnd: "9 月末",
    investorRelationsUrl: "https://investor.apple.com/",
    reports: annualReports("a", "NASDAQ_AAPL", "https://investor.apple.com/"),
    metrics: [
      { fiscalYear: 2015, revenue: 233.7, operatingIncome: 71.2, netIncome: 53.4, freeCashFlow: 69.8, grossMargin: 40.1, rdExpense: 8.1 },
      { fiscalYear: 2016, revenue: 215.6, operatingIncome: 60.0, netIncome: 45.7, freeCashFlow: 52.3, grossMargin: 39.1, rdExpense: 10.0 },
      { fiscalYear: 2017, revenue: 229.2, operatingIncome: 61.3, netIncome: 48.4, freeCashFlow: 50.8, grossMargin: 38.5, rdExpense: 11.6 },
      { fiscalYear: 2018, revenue: 265.6, operatingIncome: 70.9, netIncome: 59.5, freeCashFlow: 64.1, grossMargin: 38.3, rdExpense: 14.2 },
      { fiscalYear: 2019, revenue: 260.2, operatingIncome: 63.9, netIncome: 55.3, freeCashFlow: 58.9, grossMargin: 37.8, rdExpense: 16.2 },
      { fiscalYear: 2020, revenue: 274.5, operatingIncome: 66.3, netIncome: 57.4, freeCashFlow: 73.4, grossMargin: 38.2, rdExpense: 18.8 },
      { fiscalYear: 2021, revenue: 365.8, operatingIncome: 108.9, netIncome: 94.7, freeCashFlow: 92.9, grossMargin: 41.8, rdExpense: 21.9 },
      { fiscalYear: 2022, revenue: 394.3, operatingIncome: 119.4, netIncome: 99.8, freeCashFlow: 111.4, grossMargin: 43.3, rdExpense: 26.3 },
      { fiscalYear: 2023, revenue: 383.3, operatingIncome: 114.3, netIncome: 97.0, freeCashFlow: 99.6, grossMargin: 44.1, rdExpense: 29.9 },
      { fiscalYear: 2024, revenue: 391.0, operatingIncome: 123.2, netIncome: 93.7, freeCashFlow: 108.8, grossMargin: 46.2, rdExpense: 31.4 },
    ],
    segments: [
      { name: "iPhone", value: 201.2 },
      { name: "Services", value: 96.2 },
      { name: "Mac", value: 30.0 },
      { name: "Wearables", value: 37.0 },
      { name: "iPad", value: 26.7 },
    ],
    watchItems: ["服务业务毛利率", "中国区收入变化", "资本回购强度"],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    legalName: "Microsoft Corporation",
    ticker: "MSFT",
    country: "us",
    countryLabel: "美国",
    currency: "USD",
    unit: "十亿美元",
    exchangeHint: "数据以 Microsoft 6 月末财年披露口径整理。",
    kinds: ["tech", "platform"],
    fiscalYearEnd: "6 月末",
    investorRelationsUrl: "https://www.microsoft.com/en-us/Investor/",
    reports: annualReports("m", "NASDAQ_MSFT", "https://www.microsoft.com/en-us/Investor/"),
    metrics: [
      { fiscalYear: 2015, revenue: 93.6, operatingIncome: 18.2, netIncome: 12.2, freeCashFlow: 23.7, grossMargin: 64.7, rdExpense: 12.0 },
      { fiscalYear: 2016, revenue: 91.2, operatingIncome: 20.2, netIncome: 16.8, freeCashFlow: 25.0, grossMargin: 61.6, rdExpense: 12.0 },
      { fiscalYear: 2017, revenue: 96.6, operatingIncome: 29.0, netIncome: 21.2, freeCashFlow: 31.4, grossMargin: 62.0, rdExpense: 13.0 },
      { fiscalYear: 2018, revenue: 110.4, operatingIncome: 35.1, netIncome: 16.6, freeCashFlow: 32.3, grossMargin: 65.2, rdExpense: 14.7 },
      { fiscalYear: 2019, revenue: 125.8, operatingIncome: 43.0, netIncome: 39.2, freeCashFlow: 38.3, grossMargin: 65.9, rdExpense: 16.9 },
      { fiscalYear: 2020, revenue: 143.0, operatingIncome: 53.0, netIncome: 44.3, freeCashFlow: 45.2, grossMargin: 67.8, rdExpense: 19.3 },
      { fiscalYear: 2021, revenue: 168.1, operatingIncome: 69.9, netIncome: 61.3, freeCashFlow: 56.1, grossMargin: 68.9, rdExpense: 20.7 },
      { fiscalYear: 2022, revenue: 198.3, operatingIncome: 83.4, netIncome: 72.7, freeCashFlow: 65.1, grossMargin: 68.4, rdExpense: 24.5 },
      { fiscalYear: 2023, revenue: 211.9, operatingIncome: 88.5, netIncome: 72.4, freeCashFlow: 59.5, grossMargin: 69.4, rdExpense: 27.2 },
      { fiscalYear: 2024, revenue: 245.1, operatingIncome: 109.4, netIncome: 88.1, freeCashFlow: 74.1, grossMargin: 69.8, rdExpense: 29.5 },
    ],
    segments: [
      { name: "Cloud", value: 105.4 },
      { name: "Productivity", value: 77.7 },
      { name: "More Personal", value: 62.0 },
    ],
    watchItems: ["Azure 增速", "AI 资本开支", "企业软件续费率"],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    legalName: "NVIDIA Corporation",
    ticker: "NVDA",
    country: "us",
    countryLabel: "美国",
    currency: "USD",
    unit: "十亿美元",
    exchangeHint: "NVIDIA 财年通常在次年 1 月末结束。",
    kinds: ["semiconductor", "tech", "game"],
    fiscalYearEnd: "1 月末",
    investorRelationsUrl: "https://investor.nvidia.com/",
    reports: annualReports("n", "NASDAQ_NVDA", "https://investor.nvidia.com/"),
    metrics: [
      { fiscalYear: 2015, revenue: 4.7, operatingIncome: 0.8, netIncome: 0.6, freeCashFlow: 0.6, grossMargin: 55.8, rdExpense: 1.4 },
      { fiscalYear: 2016, revenue: 5.0, operatingIncome: 0.7, netIncome: 0.6, freeCashFlow: 0.8, grossMargin: 56.1, rdExpense: 1.3 },
      { fiscalYear: 2017, revenue: 6.9, operatingIncome: 1.9, netIncome: 1.7, freeCashFlow: 1.5, grossMargin: 58.8, rdExpense: 1.5 },
      { fiscalYear: 2018, revenue: 9.7, operatingIncome: 3.2, netIncome: 3.0, freeCashFlow: 2.9, grossMargin: 59.9, rdExpense: 1.8 },
      { fiscalYear: 2019, revenue: 11.7, operatingIncome: 3.8, netIncome: 4.1, freeCashFlow: 3.1, grossMargin: 61.2, rdExpense: 2.4 },
      { fiscalYear: 2020, revenue: 10.9, operatingIncome: 2.8, netIncome: 2.8, freeCashFlow: 3.3, grossMargin: 62.0, rdExpense: 2.8 },
      { fiscalYear: 2021, revenue: 16.7, operatingIncome: 4.5, netIncome: 4.3, freeCashFlow: 4.7, grossMargin: 62.3, rdExpense: 3.9 },
      { fiscalYear: 2022, revenue: 26.9, operatingIncome: 10.0, netIncome: 9.8, freeCashFlow: 8.1, grossMargin: 64.9, rdExpense: 5.3 },
      { fiscalYear: 2023, revenue: 27.0, operatingIncome: 4.2, netIncome: 4.4, freeCashFlow: 3.8, grossMargin: 56.9, rdExpense: 7.3 },
      { fiscalYear: 2024, revenue: 60.9, operatingIncome: 33.0, netIncome: 29.8, freeCashFlow: 27.0, grossMargin: 72.7, rdExpense: 8.7 },
    ],
    segments: [
      { name: "Data Center", value: 47.5 },
      { name: "Gaming", value: 10.4 },
      { name: "Professional", value: 1.6 },
      { name: "Auto", value: 1.1 },
    ],
    watchItems: ["数据中心收入集中度", "供给约束", "毛利率可持续性"],
  },
  {
    id: "tencent",
    name: "Tencent",
    legalName: "Tencent Holdings Limited",
    ticker: "0700.HK",
    country: "hongkong",
    countryLabel: "港股",
    currency: "HKD",
    unit: "十亿港元",
    exchangeHint: "收入与利润为港元口径，适合与港股披露对照。",
    kinds: ["tech", "game", "platform"],
    fiscalYearEnd: "12 月末",
    investorRelationsUrl: "https://www.tencent.com/en-us/investors.html",
    reports: sourcePageReports("Tencent IR reports", "https://www.tencent.com/en-us/investors/financial-reports.html"),
    metrics: [
      { fiscalYear: 2015, revenue: 102.9, operatingIncome: 40.6, netIncome: 28.8, freeCashFlow: 22.5, grossMargin: 60.0, rdExpense: 9.0 },
      { fiscalYear: 2016, revenue: 151.9, operatingIncome: 56.1, netIncome: 41.1, freeCashFlow: 34.0, grossMargin: 56.0, rdExpense: 11.8 },
      { fiscalYear: 2017, revenue: 237.8, operatingIncome: 90.3, netIncome: 71.5, freeCashFlow: 61.0, grossMargin: 50.0, rdExpense: 17.4 },
      { fiscalYear: 2018, revenue: 312.7, operatingIncome: 96.6, netIncome: 79.0, freeCashFlow: 72.6, grossMargin: 45.0, rdExpense: 22.9 },
      { fiscalYear: 2019, revenue: 377.3, operatingIncome: 118.7, netIncome: 93.3, freeCashFlow: 96.0, grossMargin: 44.4, rdExpense: 30.4 },
      { fiscalYear: 2020, revenue: 482.1, operatingIncome: 184.2, netIncome: 159.8, freeCashFlow: 123.0, grossMargin: 45.9, rdExpense: 39.0 },
      { fiscalYear: 2021, revenue: 560.1, operatingIncome: 271.6, netIncome: 224.8, freeCashFlow: 141.0, grossMargin: 43.9, rdExpense: 51.9 },
      { fiscalYear: 2022, revenue: 554.6, operatingIncome: 153.5, netIncome: 188.2, freeCashFlow: 127.5, grossMargin: 43.2, rdExpense: 61.4 },
      { fiscalYear: 2023, revenue: 609.0, operatingIncome: 194.1, netIncome: 115.2, freeCashFlow: 167.0, grossMargin: 48.0, rdExpense: 64.1 },
      { fiscalYear: 2024, revenue: 660.3, operatingIncome: 225.6, netIncome: 194.1, freeCashFlow: 190.0, grossMargin: 50.2, rdExpense: 70.7 },
    ],
    segments: [
      { name: "VAS / Games", value: 298.4 },
      { name: "FinTech", value: 220.0 },
      { name: "Advertising", value: 118.0 },
      { name: "Other", value: 23.9 },
    ],
    watchItems: ["游戏版号与流水", "视频号广告", "金融科技费率"],
  },
  {
    id: "sony",
    name: "Sony",
    legalName: "Sony Group Corporation",
    ticker: "6758.T",
    country: "japan",
    countryLabel: "日本",
    currency: "JPY",
    unit: "十亿日元",
    exchangeHint: "数据以 Sony 财年披露口径整理。",
    kinds: ["tech", "game", "platform"],
    fiscalYearEnd: "3 月末",
    investorRelationsUrl: "https://www.sony.com/en/SonyInfo/IR/",
    reports: sourcePageReports("Sony IR library", "https://www.sony.com/en/SonyInfo/IR/library/"),
    metrics: [
      { fiscalYear: 2015, revenue: 8215, operatingIncome: 69, netIncome: -126, freeCashFlow: 180, grossMargin: 25.1, rdExpense: 467 },
      { fiscalYear: 2016, revenue: 8106, operatingIncome: 294, netIncome: 147, freeCashFlow: 340, grossMargin: 27.0, rdExpense: 468 },
      { fiscalYear: 2017, revenue: 8544, operatingIncome: 289, netIncome: 73, freeCashFlow: 290, grossMargin: 27.5, rdExpense: 454 },
      { fiscalYear: 2018, revenue: 8666, operatingIncome: 735, netIncome: 491, freeCashFlow: 560, grossMargin: 28.3, rdExpense: 478 },
      { fiscalYear: 2019, revenue: 8260, operatingIncome: 894, netIncome: 916, freeCashFlow: 620, grossMargin: 29.0, rdExpense: 497 },
      { fiscalYear: 2020, revenue: 8999, operatingIncome: 846, netIncome: 582, freeCashFlow: 710, grossMargin: 28.9, rdExpense: 500 },
      { fiscalYear: 2021, revenue: 9921, operatingIncome: 972, netIncome: 1029, freeCashFlow: 870, grossMargin: 29.2, rdExpense: 532 },
      { fiscalYear: 2022, revenue: 11015, operatingIncome: 1202, netIncome: 882, freeCashFlow: 760, grossMargin: 28.1, rdExpense: 545 },
      { fiscalYear: 2023, revenue: 13021, operatingIncome: 1303, netIncome: 1005, freeCashFlow: 820, grossMargin: 27.8, rdExpense: 572 },
      { fiscalYear: 2024, revenue: 12957, operatingIncome: 1208, netIncome: 970, freeCashFlow: 790, grossMargin: 28.4, rdExpense: 620 },
    ],
    segments: [
      { name: "Game & Network", value: 4267 },
      { name: "Music", value: 1619 },
      { name: "Pictures", value: 1493 },
      { name: "Imaging", value: 1603 },
      { name: "Finance", value: 1368 },
    ],
    watchItems: ["PlayStation 硬件周期", "音乐版权资产", "日元汇率"],
  },
  {
    id: "nintendo",
    name: "Nintendo",
    legalName: "Nintendo Co., Ltd.",
    ticker: "7974.T",
    country: "japan",
    countryLabel: "日本",
    currency: "JPY",
    unit: "十亿日元",
    exchangeHint: "数据以 Nintendo 3 月末财年披露口径整理。",
    kinds: ["game"],
    fiscalYearEnd: "3 月末",
    investorRelationsUrl: "https://www.nintendo.co.jp/ir/en/",
    reports: sourcePageReports("Nintendo annual reports", "https://www.nintendo.co.jp/ir/en/library/annual/"),
    metrics: [
      { fiscalYear: 2015, revenue: 549, operatingIncome: 25, netIncome: 42, freeCashFlow: 36, grossMargin: 39.7, rdExpense: 60 },
      { fiscalYear: 2016, revenue: 505, operatingIncome: 33, netIncome: 16, freeCashFlow: 29, grossMargin: 41.2, rdExpense: 69 },
      { fiscalYear: 2017, revenue: 489, operatingIncome: 29, netIncome: 103, freeCashFlow: 71, grossMargin: 44.0, rdExpense: 59 },
      { fiscalYear: 2018, revenue: 1055, operatingIncome: 178, netIncome: 140, freeCashFlow: 184, grossMargin: 38.9, rdExpense: 64 },
      { fiscalYear: 2019, revenue: 1200, operatingIncome: 250, netIncome: 194, freeCashFlow: 180, grossMargin: 40.0, rdExpense: 70 },
      { fiscalYear: 2020, revenue: 1308, operatingIncome: 353, netIncome: 259, freeCashFlow: 320, grossMargin: 43.1, rdExpense: 84 },
      { fiscalYear: 2021, revenue: 1759, operatingIncome: 641, netIncome: 480, freeCashFlow: 512, grossMargin: 55.4, rdExpense: 93 },
      { fiscalYear: 2022, revenue: 1695, operatingIncome: 593, netIncome: 477, freeCashFlow: 441, grossMargin: 55.8, rdExpense: 102 },
      { fiscalYear: 2023, revenue: 1601, operatingIncome: 504, netIncome: 432, freeCashFlow: 390, grossMargin: 56.2, rdExpense: 110 },
      { fiscalYear: 2024, revenue: 1672, operatingIncome: 529, netIncome: 490, freeCashFlow: 410, grossMargin: 55.0, rdExpense: 118 },
    ],
    segments: [
      { name: "Switch hardware", value: 675 },
      { name: "Software", value: 899 },
      { name: "Mobile / IP", value: 92 },
      { name: "Other", value: 6 },
    ],
    watchItems: ["主机换代窗口", "第一方软件 attach rate", "IP 授权收入"],
  },
  {
    id: "moutai",
    name: "Kweichow Moutai",
    legalName: "Kweichow Moutai Co., Ltd.",
    ticker: "600519.SS",
    country: "china_a",
    countryLabel: "中国A股",
    currency: "CNY",
    unit: "十亿元",
    exchangeHint: "示例数据按 A 股年报口径整理，后续可接上交易所公告自动校验。",
    kinds: ["consumer"],
    fiscalYearEnd: "12 月末",
    investorRelationsUrl: "https://www.moutaichina.com/",
    reports: sourcePageReports("SSE announcements / Moutai IR", "https://www.sse.com.cn/assortment/stock/list/info/announcement/index.shtml?productId=600519"),
    metrics: [
      { fiscalYear: 2015, revenue: 32.7, operatingIncome: 22.0, netIncome: 15.5, freeCashFlow: 18.2, grossMargin: 92.2, rdExpense: 0.1 },
      { fiscalYear: 2016, revenue: 40.2, operatingIncome: 27.8, netIncome: 18.4, freeCashFlow: 21.9, grossMargin: 91.2, rdExpense: 0.1 },
      { fiscalYear: 2017, revenue: 58.2, operatingIncome: 39.7, netIncome: 27.1, freeCashFlow: 32.0, grossMargin: 89.8, rdExpense: 0.1 },
      { fiscalYear: 2018, revenue: 77.2, operatingIncome: 51.4, netIncome: 35.2, freeCashFlow: 39.5, grossMargin: 91.1, rdExpense: 0.1 },
      { fiscalYear: 2019, revenue: 88.9, operatingIncome: 59.0, netIncome: 41.2, freeCashFlow: 45.9, grossMargin: 91.4, rdExpense: 0.2 },
      { fiscalYear: 2020, revenue: 98.0, operatingIncome: 66.1, netIncome: 46.7, freeCashFlow: 51.2, grossMargin: 91.5, rdExpense: 0.2 },
      { fiscalYear: 2021, revenue: 109.5, operatingIncome: 74.5, netIncome: 52.5, freeCashFlow: 59.0, grossMargin: 91.6, rdExpense: 0.2 },
      { fiscalYear: 2022, revenue: 127.6, operatingIncome: 87.9, netIncome: 62.7, freeCashFlow: 69.4, grossMargin: 91.9, rdExpense: 0.3 },
      { fiscalYear: 2023, revenue: 150.6, operatingIncome: 104.3, netIncome: 74.7, freeCashFlow: 82.0, grossMargin: 92.0, rdExpense: 0.3 },
      { fiscalYear: 2024, revenue: 174.1, operatingIncome: 121.0, netIncome: 86.2, freeCashFlow: 96.0, grossMargin: 91.8, rdExpense: 0.4 },
    ],
    segments: [
      { name: "Moutai liquor", value: 148.0 },
      { name: "Series liquor", value: 24.6 },
      { name: "Other", value: 1.5 },
    ],
    geography: [
      { name: "Domestic direct sales", value: 75.0 },
      { name: "Domestic wholesale", value: 91.8 },
      { name: "International", value: 7.3 },
    ],
    watchItems: ["直销占比", "系列酒增长", "渠道库存与批价"],
  },
  {
    id: "popmart",
    name: "Pop Mart",
    legalName: "Pop Mart International Group Limited",
    ticker: "9992.HK",
    country: "hongkong",
    countryLabel: "港股",
    currency: "HKD",
    unit: "十亿港元",
    exchangeHint: "示例数据按港股年报口径整理，适合展示 IP 消费公司的分部拆解。",
    kinds: ["consumer", "retail"],
    fiscalYearEnd: "12 月末",
    investorRelationsUrl: "https://www.popmart.com/",
    reports: sourcePageReports("Pop Mart investor relations", "https://www.popmart.com/us/investor-relations"),
    metrics: [
      { fiscalYear: 2015, revenue: 0.1, operatingIncome: 0.0, netIncome: 0.0, freeCashFlow: 0.0, grossMargin: 48.0, rdExpense: 0.0 },
      { fiscalYear: 2016, revenue: 0.2, operatingIncome: 0.0, netIncome: 0.0, freeCashFlow: 0.0, grossMargin: 50.0, rdExpense: 0.0 },
      { fiscalYear: 2017, revenue: 0.5, operatingIncome: 0.1, netIncome: 0.1, freeCashFlow: 0.1, grossMargin: 53.0, rdExpense: 0.0 },
      { fiscalYear: 2018, revenue: 0.8, operatingIncome: 0.2, netIncome: 0.1, freeCashFlow: 0.1, grossMargin: 55.0, rdExpense: 0.0 },
      { fiscalYear: 2019, revenue: 1.7, operatingIncome: 0.5, netIncome: 0.4, freeCashFlow: 0.4, grossMargin: 64.8, rdExpense: 0.0 },
      { fiscalYear: 2020, revenue: 2.5, operatingIncome: 0.6, netIncome: 0.5, freeCashFlow: 0.5, grossMargin: 63.4, rdExpense: 0.0 },
      { fiscalYear: 2021, revenue: 4.5, operatingIncome: 1.0, netIncome: 0.9, freeCashFlow: 0.8, grossMargin: 61.4, rdExpense: 0.1 },
      { fiscalYear: 2022, revenue: 4.6, operatingIncome: 0.7, netIncome: 0.5, freeCashFlow: 0.6, grossMargin: 57.5, rdExpense: 0.1 },
      { fiscalYear: 2023, revenue: 6.3, operatingIncome: 1.2, netIncome: 1.1, freeCashFlow: 1.2, grossMargin: 61.3, rdExpense: 0.1 },
      { fiscalYear: 2024, revenue: 13.0, operatingIncome: 3.9, netIncome: 3.3, freeCashFlow: 3.5, grossMargin: 66.8, rdExpense: 0.2 },
    ],
    segments: [
      { name: "Molly / core IP", value: 3.6 },
      { name: "The Monsters", value: 3.1 },
      { name: "Skullpanda", value: 1.7 },
      { name: "Other IP / retail", value: 4.6 },
    ],
    geography: [
      { name: "Mainland China", value: 7.2 },
      { name: "Hong Kong / Macau / Taiwan", value: 1.0 },
      { name: "Asia ex-China", value: 2.0 },
      { name: "Americas / Europe", value: 2.8 },
    ],
    watchItems: ["海外收入占比", "核心 IP 生命周期", "门店与线上渠道效率"],
  },
];

export const companies: Company[] = companySeeds.map(completeCompany);
