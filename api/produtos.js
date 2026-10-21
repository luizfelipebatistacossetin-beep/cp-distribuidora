// Função da Vercel: busca os produtos no Supabase e entrega para o site
// no endereço /api/produtos.
//
// Como funciona:
//   Noturno ERP (servidor da loja) -> programa "ponte" -> Supabase -> este arquivo -> site
//
// A ponte (que roda no servidor da loja) é quem envia produtos, preços,
// estoque e fotos para a tabela "produtos" do Supabase. Aqui o site só LÊ.
//
// A chave abaixo é a "publishable key": ela é pública e só permite ler
// os produtos ativos (a proteção está no próprio Supabase). Se um dia quiser
// trocar, crie na Vercel (Settings > Environment Variables):
//   SUPABASE_URL                endereço do projeto
//   SUPABASE_PUBLISHABLE_KEY    chave pública (sb_publishable_...)
//
// Enquanto a tabela estiver vazia, o site continua mostrando o catálogo
// de demonstração.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://twuanfncbxidvpixkfez.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_dMLTBDxboDFmhlKVggSGAg_dmxv8xfj";

const MINUTOS_CACHE = 5; // de quanto em quanto tempo o site pergunta de novo ao Supabase

module.exports = async (req, res) => {
  try {
    // O Supabase entrega no máximo 1000 por vez: busca em páginas até acabar
    const lista = [];
    for (let inicio = 0; ; inicio += 1000) {
      const endereco = `${SUPABASE_URL}/rest/v1/produtos?select=*&ativo=eq.true&order=nome.asc`;
      const resposta = await fetch(endereco, {
        headers: { apikey: SUPABASE_KEY, Accept: "application/json", Range: `${inicio}-${inicio + 999}` }
      });
      if (!resposta.ok) throw new Error(`Supabase respondeu ${resposta.status}: ${await resposta.text()}`);
      const pagina = await resposta.json();
      lista.push(...pagina);
      if (pagina.length < 1000) break;
    }
    // Esconde o que estiver na tabela "ocultos" do Supabase (grupos, palavras ou produtos)
    const ocultos = await buscarOcultos();
    const visiveis = lista.filter(item => !estaOculto(item, ocultos));

    // Ordem de prioridade (vale dentro de cada grupo):
    //   1) em estoque  2) com foto  3) limpeza/estética antes dos outros grupos  4) nome
    const produtos = visiveis.map(converter).filter(p => p.id && p.nome)
      .sort((a, b) => (temEstoque(b) - temEstoque(a)) || (temFoto(b) - temFoto(a)) ||
        (ordemGrupo(a.cat) - ordemGrupo(b.cat)) || a.nome.localeCompare(b.nome, "pt-BR"));

    // Data da última atualização feita pela ponte
    const ultima = lista.reduce((max, p) => (p.atualizado_em && p.atualizado_em > max ? p.atualizado_em : max), "");

    // A Vercel guarda a resposta por alguns minutos para o site ficar rápido.
    res.setHeader("Cache-Control", `s-maxage=${MINUTOS_CACHE * 60}, stale-while-revalidate=3600`);
    res.status(200).json({ atualizadoEm: ultima || new Date().toISOString(), produtos });
  } catch (e) {
    console.error("Falha ao buscar produtos no Supabase:", e);
    res.status(502).json({ erro: "Não foi possível carregar os produtos agora." });
  }
};

async function buscarOcultos() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ocultos?select=tipo,valor`, {
      headers: { apikey: SUPABASE_KEY, Accept: "application/json" }
    });
    if (!r.ok) return [];
    return (await r.json()).map(o => ({ tipo: normalizar(o.tipo), valor: normalizar(o.valor) })).filter(o => o.valor);
  } catch { return []; }
}

function normalizar(t) {
  return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// tipo "grupo": esconde o grupo inteiro (ex.: AUTOMOTIVO)
// tipo "palavra": esconde produtos com essa palavra no nome (ex.: GASOLINA)
// tipo "produto": esconde um produto pelo nome completo
function estaOculto(item, ocultos) {
  const grupo = normalizar(item.categoria), nome = normalizar(item.nome);
  return ocultos.some(o =>
    (o.tipo === "grupo" && grupo === o.valor) ||
    (o.tipo === "palavra" && nome.includes(o.valor)) ||
    (o.tipo === "produto" && nome === o.valor));
}

function temEstoque(p) { return p.estoque == null || p.estoque > 0 ? 1 : 0; }
function temFoto(p) { return p.foto ? 1 : 0; }
const ORDEM_GRUPOS = ["lavagem", "pneus", "acessorios", "oleos", "pecas"];
function ordemGrupo(cat) { const i = ORDEM_GRUPOS.indexOf(cat); return i < 0 ? 99 : i; }

// Transforma uma linha da tabela "produtos" no formato que o site usa.
function converter(item) {
  const preco = Number(item.preco ?? 0);
  const estoque = item.estoque;
  return {
    id: String(item.id_interno ?? ""),
    nome: item.nome ?? "",
    cat: categoria(item.categoria ?? ""),
    espec: [item.marca, item.codigo ? `Cód. ${item.codigo}` : ""].filter(Boolean).join(" · "),
    placa: item.marca ?? "",
    foto: item.foto_url ?? "",
    preco: preco > 0 ? preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    estoque: estoque == null ? null : Math.max(0, Number(estoque) || 0),
    desc: item.descricao ?? ""
  };
}

// Liga os grupos do sistema às categorias que aparecem no site.
// Grupos que não estiverem aqui aparecem com o próprio nome.
function categoria(grupo) {
  const g = String(grupo).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/lav|estet|limp|cera|shamp/.test(g)) return "lavagem";
  if (/pneu|roda/.test(g)) return "pneus";
  if (/oleo|fluid|aditiv|lubri/.test(g)) return "oleos";
  if (/acess/.test(g)) return "acessorios";
  if (/peca|filtro|freio|lamp|palhet/.test(g)) return "pecas";
  return String(grupo).trim() || "outros";
}
