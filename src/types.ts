export type CountryCode = "us" | "china" | "japan";

export type CompanyKind = "tech" | "game" | "platform" | "semiconductor";

export type LinkStatus = "verified" | "seeded" | "source-page";

export interface ReportLink {
  fiscalYear: number;
  title: string;
  pdfUrl: string;
  sourceName: string;
  sourceUrl: string;
  status: LinkStatus;
}

export interface FinancialMetric {
  fiscalYear: number;
  revenue: number;
  operatingIncome: number;
  netIncome: number;
  freeCashFlow: number;
  grossMargin: number;
  rdExpense: number;
}

export interface SegmentValue {
  name: string;
  value: number;
}

export interface Company {
  id: string;
  name: string;
  legalName: string;
  ticker: string;
  country: CountryCode;
  countryLabel: string;
  currency: string;
  unit: string;
  exchangeHint: string;
  kinds: CompanyKind[];
  fiscalYearEnd: string;
  investorRelationsUrl: string;
  reports: ReportLink[];
  metrics: FinancialMetric[];
  segments: SegmentValue[];
  watchItems: string[];
}

export interface ExtractedMetric {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface PdfAnalysis {
  fileName: string;
  pages: number;
  textSample: string;
  extracted: ExtractedMetric[];
}
