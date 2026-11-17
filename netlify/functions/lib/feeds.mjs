// Fontes de notícias (RSS). Para trocar ou adicionar fontes, edite esta lista.
export const FEEDS = [
  // Investing.com Brasil: só as editorias do foco do Shark News
  { url: "https://br.investing.com/rss/news_1.rss",   source: "Investing.com", cat: "cambio" },   // câmbio / dólar
  { url: "https://br.investing.com/rss/news_11.rss",  source: "Investing.com", cat: "commod" },   // petróleo e commodities
  { url: "https://br.investing.com/rss/news_301.rss", source: "Investing.com", cat: "cripto" },   // criptomoedas
  { url: "https://br.investing.com/rss/news_14.rss",  source: "Investing.com", cat: "economia" }, // economia
  { url: "https://br.investing.com/rss/news_95.rss",  source: "Investing.com", cat: "economia" }, // indicadores econômicos
  // Portais gerais: entram só as notícias que batem com o foco
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
const strip = s => decode(
    String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
  ).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

// Imagem de capa que o próprio feed disponibiliza (enclosure, media:content, media:thumbnail ou 1ª imagem do texto)
function pickImage(b) {
  const tries = [];
  for (const m of b.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)) {
    const tagTxt = m[0], u = tagTxt.match(/url="([^"]+)"/i);
    if (!u) continue;
    const type = (tagTxt.match(/type="([^"]+)"/i) || [])[1] || "", medium = (tagTxt.match(/medium="([^"]+)"/i) || [])[1] || "";
    if (/image/i.test(type) || /image/i.test(medium) || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u[1]) || /media:thumbnail/i.test(tagTxt)) tries.push(u[1]);
  }
  const html = decode(tag(b, "content:encoded") + " " + tag(b, "description"));
  const img = html.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
  if (img) tries.push(img[1]);
  const url = tries.map(u => decode(u).trim()).find(u => /^https:\/\//.test(u));
  return url || null;
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
    return { title, link, date, summary, image: pickImage(b), source: feed.source, cat: feed.cat || guessCat(title + " " + summary) };
  }).filter(i => i.title && i.cat && /^https?:\/\//.test(i.link) && !SKIP_LINK.test(i.link) && !SKIP_TITLE.test(i.title));
}

// Foco: dólar, petróleo, criptomoedas e economia. Retorna null quando a notícia está fora do foco.
export function guessCat(t) {
  t = t.toLowerCase();
  if (/bitcoin|cripto|ethereum|\bbtc\b|blockchain|solana|stablecoin|etf de bitcoin/.test(t)) return "cripto";
  if (/dólar|dolar|câmbio|cambio|\beuro\b|iene|libra esterlina|\bmoedas?\b|\breal\b.*(dólar|moeda)/.test(t)) return "cambio";
  if (/petróleo|petroleo|petrobras|\bopep\b|brent|\bwti\b|combustíve|gasolina|diesel|\bouro\b|commodit|minério|minerio/.test(t)) return "commod";
  if (/juros|selic|copom|inflação|inflacao|ipca|igp-?m|\bpib\b|fiscal|tesouro|banco central|\bfed\b|federal reserve|desemprego|payroll|recessão|economia|dívida pública|divida publica|ibovespa|mercado financeiro|taxa de câmbio/.test(t)) return "economia";
  return null;
}

// Tipos de conteúdo automático que não interessam ao leitor do Shark News
const SKIP_LINK = /\/(transcripts|insider-trading-news|earnings)\//i;
const SKIP_TITLE = /^por que as ações d[aoe]s? |compra US\$ [\d.,]+ em ações|vende US\$ [\d.,]+ em ações/i;

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
  const items = all.slice(0, 60);
  // Notícias do topo sem foto no feed: busca a imagem de compartilhamento (og:image) da própria matéria
  await Promise.all(items.slice(0, 14).filter(i => !i.image).map(async i => {
    try {
      const r = await fetch(i.link, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SharkNewsBot/1.0)" }, signal: AbortSignal.timeout(3500) });
      if (!r.ok) return;
      const html = (await r.text()).slice(0, 200000);
      const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
             || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      const u = m && decode(m[1]).trim();
      if (u && /^https:\/\//.test(u)) i.image = u;
    } catch (e) {}
  }));
  return {
    updated: Date.now(),
    items,
    sources: results.map(({ items, ...r }) => r)
  };
}
