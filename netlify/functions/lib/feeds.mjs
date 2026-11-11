// Fontes de notícias (RSS). Para trocar ou adicionar fontes, edite esta lista.
export const FEEDS = [
  { url: "https://br.investing.com/rss/news.rss",     source: "Investing.com", cat: null },
  { url: "https://br.investing.com/rss/news_25.rss",  source: "Investing.com", cat: "bolsa" },
  { url: "https://br.investing.com/rss/news_1.rss",   source: "Investing.com", cat: "cambio" },
  { url: "https://br.investing.com/rss/news_301.rss", source: "Investing.com", cat: "cripto" },
  { url: "https://br.investing.com/rss/news_11.rss",  source: "Investing.com", cat: "commod" },
  { url: "https://br.investing.com/rss/news_14.rss",  source: "Investing.com", cat: "economia" },
  { url: "https://www.infomoney.com.br/feed/",        source: "InfoMoney",     cat: null },
  { url: "https://www.moneytimes.com.br/feed/",       source: "Money Times",   cat: null }
];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const strip = s => decode(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

export function parseRss(xml, feed) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map(b => {
    const title = strip(tag(b, "title"));
    let link = strip(tag(b, "link"));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const date = Date.parse(strip(tag(b, "pubDate")) || strip(tag(b, "dc:date"))) || Date.now();
    let summary = strip(tag(b, "description"));
    if (summary.length > 240) summary = summary.slice(0, 237).replace(/\s+\S*$/, "") + "…";
    return { title, link, date, summary, source: feed.source, cat: feed.cat || guessCat(title + " " + summary) };
  }).filter(i => i.title && /^https?:\/\//.test(i.link));
}

export function guessCat(t) {
  t = t.toLowerCase();
  if (/bitcoin|cripto|ethereum|\bbtc\b|blockchain|solana/.test(t)) return "cripto";
  if (/dólar|dolar|câmbio|cambio|\beuro\b|iene|libra|moeda/.test(t)) return "cambio";
  if (/petróleo|petroleo|\bouro\b|minério|minerio|commodit|soja|milho|brent|wti/.test(t)) return "commod";
  if (/wall street|nova york|s&p|nasdaq|dow jones|\bfed\b|china|europa|japão|eua\b/.test(t)) return "inter";
  if (/ibovespa|ações|acoes|bolsa|\bb3\b|dividend|fii|fundos imobili/.test(t)) return "bolsa";
  return "economia";
}

export async function loadNews() {
  const results = await Promise.all(FEEDS.map(async f => {
    try {
      const r = await fetch(f.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SharkNewsBot/1.0)", "Accept": "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const items = parseRss(await r.text(), f);
      return { ok: true, url: f.url, source: f.source, count: items.length, items };
    } catch (e) {
      return { ok: false, url: f.url, source: f.source, count: 0, error: String(e.message || e), items: [] };
    }
  }));
  const seen = new Set(), all = [];
  for (const it of results.flatMap(r => r.items).sort((a, b) => b.date - a.date)) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9à-ú]/g, "").slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k); all.push(it);
  }
  return {
    updated: Date.now(),
    items: all.slice(0, 60),
    sources: results.map(({ items, ...r }) => r)
  };
}
