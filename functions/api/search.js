const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  "accept-language": "pt-PT,pt;q=0.9,en;q=0.7",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
};

const STORES = [
  {
    id: "continente",
    name: "Continente",
    searchUrl: (q) => `https://www.continente.pt/pesquisa/?q=${encodeURIComponent(q)}`,
    host: "https://www.continente.pt",
  },
  {
    id: "auchan",
    name: "Auchan",
    searchUrl: (q) => `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(q)}`,
    host: "https://www.auchan.pt",
  },
  {
    id: "lidl",
    name: "Lidl",
    searchUrl: (q) => `https://www.lidl.pt/q/search?q=${encodeURIComponent(q)}`,
    host: "https://www.lidl.pt",
  },
  {
    id: "pingodoce",
    name: "Pingo Doce",
    searchUrl: (q) => `https://www.pingodoce.pt/?s=${encodeURIComponent(q)}`,
    host: "https://www.pingodoce.pt",
  },
];

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();

function absolute(url, host) {
  try {
    return new URL(url, host).href;
  } catch {
    return host;
  }
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&euro;/gi, "€");
}

function stripTags(value = "") {
  return clean(
    decodeHtml(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function euroToNumber(value = "") {
  const matches =
    value.match(/(?:\d{1,3}(?:[. ]\d{3})*|\d+)[,.]\d{2}\s*€/g) ||
    value.match(/€\s*(?:\d{1,3}(?:[. ]\d{3})*|\d+)[,.]\d{2}/g) ||
    [];

  if (!matches.length) return null;
  const raw = matches[matches.length - 1]
    .replace(/[^0-9,.]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function extractJsonLd(html, store, fallbackUrl) {
  const items = [];
  const scripts = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scripts.exec(html))) {
    try {
      const parsed = JSON.parse(match[1]);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }

        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = Number(offer?.price ?? node.price ?? node.lowPrice);
        const name = clean(node.name || node.headline || "");
        if (name && Number.isFinite(price) && price > 0 && price < 100) {
          items.push({
            name,
            price,
            unit: clean(node.unitText || ""),
            url: absolute(node.url || offer?.url || fallbackUrl, store.host),
          });
        }
        Object.values(node).forEach(visit);
      };
      visit(parsed);
    } catch {
      // Invalid JSON-LD is ignored because many retail pages contain partial snippets.
    }
  }
  return items;
}

function extractVisiblePrices(html, store, query, fallbackUrl) {
  const items = [];
  const firstWord = query.toLocaleLowerCase("pt-PT").split(/\s+/)[0];
  const chunks = html.split(/<\/(?:article|li|div)>/i).slice(0, 2200);

  for (const raw of chunks) {
    const lower = raw.toLocaleLowerCase("pt-PT");
    if (!lower.includes(firstWord) || !(/[,.]\d{2}\s*€|€\s*\d/.test(raw))) continue;

    const text = stripTags(raw);
    const price = euroToNumber(text);
    if (price == null || price <= 0 || price > 100) continue;

    const titleMatch =
      raw.match(/(?:title|aria-label)=["']([^"']{3,160})["']/i) ||
      raw.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const name = titleMatch ? stripTags(titleMatch[1]) : text.slice(0, 120);
    if (!name.toLocaleLowerCase("pt-PT").includes(firstWord)) continue;

    const href = (raw.match(/href=["']([^"']+)["']/i) || [])[1];
    const unitMatch = text.match(/(?:\d+[,.]?\d*\s*€\s*\/\s*)?(kg|un|emb|l|lt)/i);
    items.push({
      name,
      price,
      unit: unitMatch ? `€/${unitMatch[1].toLowerCase()}` : "",
      url: absolute(href || fallbackUrl, store.host),
    });
  }
  return items;
}

async function fetchStore(store, query) {
  const searchUrl = store.searchUrl(query);
  try {
    const response = await fetch(searchUrl, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const candidates = contentType.includes("json")
      ? []
      : [
          ...extractJsonLd(body, store, searchUrl),
          ...extractVisiblePrices(body, store, query, searchUrl),
        ];

    const seen = new Set();
    const items = candidates
      .filter((item) => {
        const key = `${item.name.toLocaleLowerCase("pt-PT")}|${item.price}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return item.name.length > 2;
      })
      .slice(0, 10);

    return {
      store: store.name,
      id: store.id,
      status: items.length ? "ok" : "no_price",
      items,
      searchUrl,
      message: items.length
        ? ""
        : "A loja não apresentou preços num formato que possa ser lido automaticamente.",
    };
  } catch (error) {
    return {
      store: store.name,
      id: store.id,
      status: "blocked",
      items: [],
      searchUrl,
      message: `Consulta automática indisponível: ${error.message}`,
    };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = clean(url.searchParams.get("q") || "").slice(0, 80);
  if (query.length < 2) return json({ error: "Indique pelo menos 2 caracteres." }, 400);

  const results = await Promise.all(STORES.map((store) => fetchStore(store, query)));
  const flat = results
    .flatMap((result) =>
      result.items.map((item) => ({
        ...item,
        store: result.store,
        storeId: result.id,
      })),
    )
    .sort((a, b) => a.price - b.price);

  return json({
    query,
    searchedAt: new Date().toISOString(),
    results,
    best: flat[0] || null,
    notice:
      "Os preços dependem do conteúdo público disponibilizado por cada loja e podem variar por região, promoção e cartão de cliente.",
  });
}
