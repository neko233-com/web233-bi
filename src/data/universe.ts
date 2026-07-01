import type { CountryCode } from "../types";

export interface ListedCompanyCandidate {
  name: string;
  ticker: string;
  market: CountryCode;
  marketLabel: string;
  sector: string;
}

export const listedCompanyUniverse: ListedCompanyCandidate[] = [
  { name: "贵州茅台", ticker: "600519.SS", market: "china_a", marketLabel: "中国A股", sector: "白酒" },
  { name: "宁德时代", ticker: "300750.SZ", market: "china_a", marketLabel: "中国A股", sector: "新能源" },
  { name: "比亚迪", ticker: "002594.SZ", market: "china_a", marketLabel: "中国A股", sector: "汽车" },
  { name: "招商银行", ticker: "600036.SS", market: "china_a", marketLabel: "中国A股", sector: "银行" },
  { name: "中国平安", ticker: "601318.SS", market: "china_a", marketLabel: "中国A股", sector: "保险" },
  { name: "五粮液", ticker: "000858.SZ", market: "china_a", marketLabel: "中国A股", sector: "白酒" },
  { name: "美的集团", ticker: "000333.SZ", market: "china_a", marketLabel: "中国A股", sector: "家电" },
  { name: "海康威视", ticker: "002415.SZ", market: "china_a", marketLabel: "中国A股", sector: "科技制造" },
  { name: "隆基绿能", ticker: "601012.SS", market: "china_a", marketLabel: "中国A股", sector: "新能源" },
  { name: "腾讯控股", ticker: "0700.HK", market: "hongkong", marketLabel: "港股", sector: "互联网" },
  { name: "阿里巴巴", ticker: "9988.HK", market: "hongkong", marketLabel: "港股", sector: "互联网" },
  { name: "美团", ticker: "3690.HK", market: "hongkong", marketLabel: "港股", sector: "本地生活" },
  { name: "泡泡玛特", ticker: "9992.HK", market: "hongkong", marketLabel: "港股", sector: "潮玩消费" },
  { name: "小米集团", ticker: "1810.HK", market: "hongkong", marketLabel: "港股", sector: "硬件互联网" },
  { name: "京东集团", ticker: "9618.HK", market: "hongkong", marketLabel: "港股", sector: "电商" },
  { name: "快手", ticker: "1024.HK", market: "hongkong", marketLabel: "港股", sector: "内容平台" },
  { name: "网易", ticker: "9999.HK", market: "hongkong", marketLabel: "港股", sector: "游戏" },
  { name: "理想汽车", ticker: "2015.HK", market: "hongkong", marketLabel: "港股", sector: "汽车" },
  { name: "Apple", ticker: "AAPL", market: "us", marketLabel: "美国", sector: "消费电子" },
  { name: "Microsoft", ticker: "MSFT", market: "us", marketLabel: "美国", sector: "软件云" },
  { name: "NVIDIA", ticker: "NVDA", market: "us", marketLabel: "美国", sector: "半导体" },
  { name: "Alphabet", ticker: "GOOGL", market: "us", marketLabel: "美国", sector: "互联网" },
  { name: "Amazon", ticker: "AMZN", market: "us", marketLabel: "美国", sector: "电商云" },
  { name: "Meta", ticker: "META", market: "us", marketLabel: "美国", sector: "社交广告" },
  { name: "Tesla", ticker: "TSLA", market: "us", marketLabel: "美国", sector: "汽车能源" },
  { name: "Netflix", ticker: "NFLX", market: "us", marketLabel: "美国", sector: "流媒体" },
  { name: "Adobe", ticker: "ADBE", market: "us", marketLabel: "美国", sector: "软件" },
  { name: "Salesforce", ticker: "CRM", market: "us", marketLabel: "美国", sector: "企业软件" },
  { name: "Sony", ticker: "6758.T", market: "japan", marketLabel: "日本", sector: "游戏娱乐" },
  { name: "Nintendo", ticker: "7974.T", market: "japan", marketLabel: "日本", sector: "游戏" },
  { name: "Toyota", ticker: "7203.T", market: "japan", marketLabel: "日本", sector: "汽车" },
  { name: "Keyence", ticker: "6861.T", market: "japan", marketLabel: "日本", sector: "自动化" },
  { name: "SoftBank Group", ticker: "9984.T", market: "japan", marketLabel: "日本", sector: "投资科技" },
];
