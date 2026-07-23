const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
  "accept-language": "pt-PT,pt;q=0.9,en;q=0.6",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
};

const STORES = [
  {
    id: "continente", name: "Continente", host: "https://www.continente.pt",
    urls: q => [
      `https://www.continente.pt/pesquisa/?q=${encodeURIComponent(q)}`,
      "https://www.continente.pt/frescos/legumes/",
      "https://www.continente.pt/frescos/frutas/",
      "https://www.continente.pt/frescos/",
    ],
  },
  {
    id: "auchan", name: "Auchan", host: "https://www.auchan.pt",
    urls: q => [
      `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(q)}`,
      "https://www.auchan.pt/pt/produtos-frescos/legumes/",
      "https://www.auchan.pt/pt/produtos-frescos/fruta/",
      "https://www.auchan.pt/pt/produtos-frescos/",
    ],
  },
  {
    id: "lidl", name: "Lidl", host: "https://www.lidl.pt",
    urls: q => [
      `https://www.lidl.pt/q/search?q=${encodeURIComponent(q)}`,
      "https://www.lidl.pt/h/frutas-e-legumes/h10071012",
    ],
  },
  {
    id: "pingodoce", name: "Pingo Doce", host: "https://www.mercadao.pt",
    urls: q => [
      `https://www.mercadao.pt/store/pingo-doce/search?queries=${encodeURIComponent(q)}`,
      `https://www.mercadao.pt/store/pingo-doce/search?query=${encodeURIComponent(q)}`,
      `https://www.pingodoce.pt/?s=${encodeURIComponent(q)}`,
    ],
  },
];

const clean = (v = "") => String(v).replace(/\s+/g, " ").trim();
const norm = (v = "") => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function absolute(url, host) { try { return new URL(url, host).href; } catch { return host; } }
function decode(v = "") {
  const named = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", euro: "€",
    aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä",
    eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
    iacute: "í", igrave: "ì", icirc: "î", iuml: "ï",
    oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö",
    uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
    ccedil: "ç", ntilde: "ñ"
  };
  return String(v)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}
function cleanName(v = "") {
  return clean(decode(v))
    .replace(/\{\{[^}]*$/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/(?:indispon[ií]vel|quantidade m[ií]nima atingida|qtd\.? m[ií]nima atingida|t\.? m[ií]nima atingida)/gi, " ")
    .replace(/\b(?:adicionar|remover|comprar|ver produto|favoritos?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:|\-–—\s]+|[,.;:|\-–—\s]+$/g, "")
    .trim();
}
function text(v = "") { return clean(decode(v.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "))); }
function num(v) { if (typeof v === "number") return v; if (!v) return null; const m=String(v).match(/\d{1,3}(?:[. ]\d{3})*(?:[,.]\d{1,2})|\d+(?:[,.]\d{1,2})?/); if(!m)return null; const n=Number(m[0].replace(/\./g,"").replace(",",".")); return Number.isFinite(n)?n:null; }
function relevant(name,q){ const n=norm(name), words=norm(q).split(/\s+/).filter(Boolean); return words.every(w=>n.includes(w)); }
function validPrice(p){ return Number.isFinite(p)&&p>0.04&&p<100; }
function unitFrom(s=""){ const t=clean(s); const m=t.match(/(?:€\s*)?\/\s*(kg|kilo|un|unidade|l|lt|litro|emb)|(?:por|vendido ao)\s+(kg|unidade)/i); return m?`€/${(m[1]||m[2]).toLowerCase().replace("kilo","kg").replace("unidade","un").replace("litro","l")}`:""; }

function walkJson(node, out, store, q, fallback){
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(x=>walkJson(x,out,store,q,fallback)); return; }
  const name=cleanName(node.name||node.productName||node.title||node.displayName||node.item_name||"");
  const offer=Array.isArray(node.offers)?node.offers[0]:node.offers;
  const price=num(offer?.price??offer?.lowPrice??node.price??node.salePrice??node.currentPrice??node.unitPrice??node.finalPrice);
  if(name&&relevant(name,q)&&validPrice(price)) out.push({name,price,unit:clean(node.unitText||node.pricePerUnit||node.unit||""),url:absolute(node.url||node.productUrl||offer?.url||fallback,store.host)});
  Object.values(node).forEach(x=>walkJson(x,out,store,q,fallback));
}

function jsonCandidates(html, store, q, fallback){
  const out=[];
  const patterns=[
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];
  for(const re of patterns){ let m; while((m=re.exec(html))){ try{walkJson(JSON.parse(decode(m[1])),out,store,q,fallback);}catch{} } }
  return out;
}

function structuredHtml(html, store, q, fallback){
  const out=[];
  const blocks=html.match(/<(?:article|li|div)[^>]*(?:product|tile|card|item)[^>]*>[\s\S]{0,12000}?<\/(?:article|li|div)>/gi)||[];
  for(const b of blocks.slice(0,3000)){
    const plain=text(b); if(!relevant(plain,q)) continue;
    const nameRaw=(b.match(/<(?:h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/i)||b.match(/(?:data-product-name|aria-label|title)=["']([^"']+)["']/i)||[])[1];
    const name=cleanName(text(nameRaw||plain.slice(0,180))); if(!relevant(name,q)) continue;
    const all=[...plain.matchAll(/(?:\d+[,.]\d{1,2}\s*€|€\s*\d+[,.]\d{1,2}|\d+[,.]\d{1,2}\s*€?\s*\/\s*(?:kg|un|l|lt))/gi)];
    if(!all.length) continue;
    let price=null; for(const x of all){ const p=num(x[0]); if(validPrice(p)) price=p; }
    if(!validPrice(price)) continue;
    const href=(b.match(/href=["']([^"']+)["']/i)||[])[1];
    out.push({name,price,unit:unitFrom(plain),url:absolute(href||fallback,store.host)});
  }
  return out;
}

// Fallback for server-rendered category pages where product markup has no stable class names.
function proximityParser(html, store, q, fallback){
  const out=[]; const plain=text(html); const low=norm(plain); const query=norm(q);
  let pos=0, count=0;
  while((pos=low.indexOf(query,pos))!==-1 && count<80){
    const before=Math.max(0,pos-100), after=Math.min(plain.length,pos+420); const chunk=plain.slice(before,after);
    const prices=[...chunk.matchAll(/(\d+[,.]\d{2})\s*€(?:\s*\/\s*(kg|un|l|lt))?/gi)];
    if(prices.length){
      const pMatch=prices[prices.length-1]; const p=num(pMatch[1]);
      if(validPrice(p)){
        const start=Math.max(0,chunk.toLowerCase().lastIndexOf(". ",Math.max(0,pos-before))-1);
        let name=cleanName(chunk.slice(start,Math.min(chunk.length,(pos-before)+100)));
        if(name.length>160) name=cleanName(name.slice(-160)); if(!relevant(name,q)) name=cleanName(chunk.slice(Math.max(0,pos-before-50),pos-before+90));
        out.push({name,price:p,unit:pMatch[2]?`€/${pMatch[2].toLowerCase()}`:unitFrom(chunk),url:fallback}); count++;
      }
    }
    pos+=query.length;
  }
  return out;
}

async function fetchOne(url, store, q){
  const r=await fetch(url,{headers:HEADERS,redirect:"follow",signal:AbortSignal.timeout(10000)});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const body=await r.text();
  return [...jsonCandidates(body,store,q,url),...structuredHtml(body,store,q,url),...proximityParser(body,store,q,url)];
}

async function fetchStore(store,q){
  const urls=store.urls(q); const gathered=[]; const errors=[];
  for(const url of urls){
    try { const found=await fetchOne(url,store,q); gathered.push(...found); if(gathered.length>=12) break; }
    catch(e){ errors.push(e.message); }
  }
  const seen=new Set(); const items=gathered.filter(x=>{
    x.name=cleanName(x.name); if(!relevant(x.name,q)||!validPrice(x.price)||x.name.length<3)return false;
    const k=`${norm(x.name)}|${x.price}|${x.unit}`; if(seen.has(k))return false; seen.add(k); return true;
  }).sort((a,b)=>a.price-b.price).slice(0,12);
  return {store:store.name,id:store.id,status:items.length?"ok":errors.length===urls.length?"blocked":"no_price",items,searchUrl:urls[0],message:items.length?"":errors.length===urls.length?`Consulta bloqueada (${errors[0]}).`:"Não foram encontrados preços públicos para este produto. Abra a pesquisa da loja para confirmar."};
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=600":"no-store","access-control-allow-origin":"*","x-content-type-options":"nosniff"}});}
export async function onRequestGet({request}){
  const u=new URL(request.url), q=clean(u.searchParams.get("q")||"").slice(0,80);
  if(q.length<2)return json({error:"Indique pelo menos 2 caracteres."},400);
  const results=await Promise.all(STORES.map(s=>fetchStore(s,q)));
  const flat=results.flatMap(r=>r.items.map(i=>({...i,store:r.store,storeId:r.id}))).sort((a,b)=>a.price-b.price);
  return json({query:q,searchedAt:new Date().toISOString(),results,best:flat[0]||null,notice:"Preços públicos recolhidos das páginas das lojas. Podem variar por região, promoção, cartão e disponibilidade."});
}
