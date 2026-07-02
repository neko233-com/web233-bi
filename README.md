# neko233-BI

原生 Vite + TypeScript 财报分析工作台，面向 Cloudflare Pages 静态部署。

## 功能

- 按国家/地区筛选科技、游戏公司。
- 收录过去 10 年财报 PDF 链接和来源。
- 用静态指标数据自动渲染收入、利润、现金流和业务分部图表。
- 支持联网搜索任意上市公司，通过 Cloudflare Pages Functions 拉取公开公司搜索与年度财务指标。
- 支持上传 PDF，渲染页面预览并尝试提取关键财务数字。
- 支持下载分析包 JSON、指标 CSV 和 SVG 图表。

## 开发

```bash
npm install
npm run dev
```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `22` 或更高
- Pages Functions 位于 `functions/`，本地可用 `npx wrangler pages dev dist` 验证。

内置 PDF 归档数据位于 `src/data/reports.ts`。实际上线前建议把链接校验流程接入脚本或后端任务，定期检查 PDF 可用性与最新年度。
