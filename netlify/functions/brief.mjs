import { loadNews } from "./lib/feeds.mjs";

const SYSTEM = `Você é o editor do Shark News, portal de notícias do mercado financeiro.
Escreva um resumo curto do dia em português do Brasil, usando SOMENTE as manchetes fornecidas.
O foco do portal é dólar e câmbio, petróleo, criptomoedas e economia (juros, inflação, Banco Central, Fed). Priorize esses temas.
Regras obrigatórias:
- Não invente fatos, números, empresas ou datas que não estejam nas manchetes.
- Nunca recomende compra, venda ou qualquer operação. Não diga o que o leitor deve fazer com o dinheiro dele.
- Não prometa ganhos nem use termos como "lucro garantido", "oportunidade imperdível", "compre", "venda agora".
- Tom direto, acessível e neutro, como uma redação jornalística.
- Cada tópico deve citar a fonte (o nome do portal) da manchete em que se baseia.
Responda APENAS com JSON válido, sem texto antes ou depois, no formato:
{"title":"título do resumo (até 90 caracteres)","lead":"parágrafo de abertura com 2 ou 3 frases","items":[{"t":"título do tópico","s":"uma frase explicando","source":"nome do portal"}]}
Use de 3 a 5 itens.`;

const BANNED = /\b(compre|comprem|venda agora|vendam|recomendamos|recomendo|lucro garantido|garantido|imperdível)\b/i;

export default async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 503, 60);

  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const edition = hour >= 17 ? "tarde" : "manha";

  const { items } = await loadNews();
  const since = Date.now() - 14 * 3600 * 1000;
  const heads = items.filter(i => i.date >= since).slice(0, 30);
  if (heads.length < 5) return json({ error: "poucas manchetes para resumir" }, 503, 300);

  const list = heads.map((h, i) => `${i + 1}. [${h.source}] ${h.title}${h.summary ? " | " + h.summary : ""}`).join("\n");
  const ask = `Edição: ${edition === "manha" ? "manhã (o que esperar e o que está mexendo com o mercado)" : "fechamento (como o mercado terminou o dia)"}.\nManchetes:\n${list}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: ask }] }),
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) throw new Error("API " + r.status + " " + (await r.text()).slice(0, 200));
      const data = await r.json();
      const text = data.content.filter(c => c.type === "text").map(c => c.text).join("").replace(/```json|```/g, "").trim();
      const b = JSON.parse(text);
      const ok = b && typeof b.title === "string" && typeof b.lead === "string" && Array.isArray(b.items) && b.items.length >= 3 && b.items.length <= 5
        && b.items.every(i => i.t && i.s && i.source) && b.lead.length < 700;
      if (!ok) throw new Error("formato inválido");
      if (BANNED.test(JSON.stringify(b))) throw new Error("termo proibido");
      return json({ edition, updated: Date.now(), ...b }, 200, 3600);
    } catch (e) {
      if (attempt === 1) return json({ error: String(e.message || e) }, 502, 120);
    }
  }
};

function json(obj, status, ttl) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${ttl}, stale-while-revalidate=${ttl}`
    }
  });
}

export const config = { path: "/api/brief" };
