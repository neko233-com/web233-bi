import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { ExtractedMetric, PdfAnalysis } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfReadResult {
  analysis: PdfAnalysis;
  previewUrl: string;
}

const metricPatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "Revenue / Net sales",
    pattern: /(?:revenue|net sales|total revenues?)\D{0,48}(\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  },
  {
    label: "Operating income",
    pattern: /operating income\D{0,48}(\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  },
  {
    label: "Net income",
    pattern: /net income\D{0,48}(\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  },
  {
    label: "Free cash flow",
    pattern: /free cash flow\D{0,48}(\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  },
  {
    label: "Operating cash flow",
    pattern: /net cash provided by operating activities\D{0,64}(\$?\s?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
  },
];

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .trim();

const extractMetrics = (text: string): ExtractedMetric[] => {
  const results: ExtractedMetric[] = [];

  for (const metric of metricPatterns) {
    const match = text.match(metric.pattern);
    if (!match?.[1]) continue;

    results.push({
      label: metric.label,
      value: match[1].replace(/\s/g, ""),
      confidence: metric.label.includes("cash") ? "medium" : "high",
    });
  }

  if (results.length === 0) {
    const genericNumbers = text.match(/(\$?\s?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g) ?? [];
    return genericNumbers.slice(0, 5).map((value, index) => ({
      label: `Detected number ${index + 1}`,
      value: value.replace(/\s/g, ""),
      confidence: "low",
    }));
  }

  return results;
};

export const readPdfFile = async (file: File): Promise<PdfReadResult> => {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1.4 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering context is unavailable.");
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await firstPage.render({
    canvasContext: context,
    viewport,
  }).promise;

  const textPages: string[] = [];
  const maxPages = Math.min(pdf.numPages, 12);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    textPages.push(pageText);
  }

  const text = normalizeText(textPages.join(" "));

  return {
    analysis: {
      fileName: file.name,
      pages: pdf.numPages,
      textSample: text.slice(0, 900),
      extracted: extractMetrics(text),
    },
    previewUrl: canvas.toDataURL("image/png"),
  };
};
