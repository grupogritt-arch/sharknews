// Cotações: B3 via brapi.dev (precisa de BRAPI_TOKEN), câmbio via AwesomeAPI, cripto via CoinGecko.
const B3 = {
  "Índices": [["^BVSP", "Ibovespa", "B3"]],
  "Ações": [["PETR4", "PETR4", "Petrobras PN"], ["VALE3", "VALE3", "Vale ON"], ["ITUB4", "ITUB4", "Itaú Unibanco PN"], ["BBAS3", "BBAS3", "Banco do Brasil ON"], ["WEGE3", "WEGE3", "WEG ON"], ["ABEV3", "ABEV3", "Ambev ON"]],
  "Fundos imobiliários": [["HGLG11", "HGLG11", "Logística"], ["KNRI11", "KNRI11", "Híbrido"], ["MXRF11", "MXRF11", "Papel"], ["XPML11", "XPML11", "Shoppings"]],
  "ETFs": [["BOVA11", "BOVA11", "Ibovespa"], ["IVVB11", "IVVB11", "S&P 500"], ["HASH11", "HASH11", "Cripto"]]
};
const FX = [["USD-BRL", "USDBRL", "Dólar", "Dólar comercial", 4], ["EUR-BRL", "EURBRL", "Euro", "Euro", 4], ["GBP-BRL", "GBPBRL", "Libra", "Libra esterlina", 4], ["EUR-USD", "EURUSD", "EUR/USD", "Euro x Dólar", 4]];
const CG = [["bitcoin", "Bitcoin", "BTC/USD", 0], ["ethereum", "Ethereum", "ETH/USD", 2], ["solana", "Solana", "SOL/USD", 2], ["binancecoin", "BNB", "BNB/USD", 2], ["ripple", "XRP", "XRP/USD", 4]];

const T = ms => AbortSignal.timeout(ms);
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));

async function brapi(symbol, token) {
  const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(symbol)}?token=${token}`, { signal: T(8000) });
  if (!r.ok) throw new Error(symbol + " HTTP " + r.status);
  const q = (await r.json()).results?.[0];
  if (!q) throw new Error(symbol + " sem dados");
  return { v: num(q.regularMarketPrice), chg: num(q.regularMarketChange), p: num(q.regularMarketChangePercent), hi: num(q.regularMarketDayHigh), lo: num(q.regularMarketDayLow), t: q.regularMarketTime ? Date.parse(q.regularMarketTime) : Date.now() };
}

export default async () => {
  const groups = {}, errors = [];
  const token = process.env.BRAPI_TOKEN;

  // B3
  if (token) {
    for (const [g, list] of Object.entries(B3)) {
      const rows = await Promise.all(list.map(async ([sym, n, s]) => {
        try { return { n, s, d: g === "Índices" ? 0 : 2, ...(await brapi(sym, token)) }; }
        catch (e) { errors.push(String(e.message || e)); return null; }
      }));
      const ok = rows.filter(Boolean);
      if (ok.length) groups[g] = ok;
    }
  } else errors.push("BRAPI_TOKEN não configurado: ações, FIIs, ETFs e Ibovespa ficam de fora");

  // Câmbio
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/" + FX.map(f => f[0]).join(","), { signal: T(8000) });
    const j = await r.json();
    groups["Câmbio"] = FX.filter(f => j[f[1]]).map(([, k, n, s, d]) => {
      const q = j[k];
      return { n, s, d, v: num(q.bid), chg: num(q.varBid), p: num(q.pctChange), hi: num(q.high), lo: num(q.low), t: Number(q.timestamp) * 1000 || Date.now() };
    });
  } catch (e) { errors.push("câmbio: " + (e.message || e)); }

  // Cripto
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + CG.map(c => c[0]).join(","), { signal: T(8000) });
    const j = await r.json();
    groups["Cripto"] = CG.map(([id, n, s, d]) => {
      const q = j.find(x => x.id === id);
      return q && { n, s, d, v: q.current_price, chg: q.price_change_24h, p: q.price_change_percentage_24h, hi: q.high_24h, lo: q.low_24h, t: Date.parse(q.last_updated) || Date.now() };
    }).filter(Boolean);
  } catch (e) { errors.push("cripto: " + (e.message || e)); }

  // Destaques: maiores altas e baixas entre as ações acompanhadas
  const acoes = (groups["Ações"] || []).filter(a => a.p !== null);
  const movers = {
    up: [...acoes].sort((a, b) => b.p - a.p).slice(0, 5),
    down: [...acoes].sort((a, b) => a.p - b.p).slice(0, 5)
  };

  const ttl = Number(process.env.QUOTES_TTL || 900);
  return new Response(JSON.stringify({ updated: Date.now(), groups, movers, errors }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
    }
  });
};

export const config = { path: "/api/quotes" };
