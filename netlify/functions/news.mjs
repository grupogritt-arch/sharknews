import { loadNews } from "./lib/feeds.mjs";

export default async () => {
  const data = await loadNews();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      // a CDN da Netlify guarda a resposta por 10 min (evita chamar as fontes a cada visita)
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=600, stale-while-revalidate=1200"
    }
  });
};

export const config = { path: "/api/news" };
