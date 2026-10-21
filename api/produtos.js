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
    const produtos = visiveis.map(converter).filter(p => p.id && p.nome && p.cat !== "diversos")
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

// Grupos/palavras/produtos escondidos direto pelo código (além da tabela "ocultos")
const OCULTOS_FIXOS = [
  { tipo: "grupo", valor: "AUTOMOTIVO" },
  { tipo: "grupo", valor: "CLAY BAR" },
  { tipo: "grupo", valor: "TERMINAL DIRECAO" },
  { tipo: "grupo", valor: "EMBALAGEM" }
];

async function buscarOcultos() {
  const fixos = OCULTOS_FIXOS.map(o => ({ tipo: normalizar(o.tipo), valor: normalizar(o.valor) }));
  return [...fixos, ...(await buscarOcultosTabela())];
}

async function buscarOcultosTabela() {
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
const ORDEM_GRUPOS = ["lavagem", "acessorios", "oleos", "pecas"];
function ordemGrupo(cat) { const i = ORDEM_GRUPOS.indexOf(cat); return i < 0 ? 99 : i; }

// Transforma uma linha da tabela "produtos" no formato que o site usa.
function converter(item) {
  const preco = Number(item.preco ?? 0);
  const estoque = item.estoque;
  return {
    id: String(item.id_interno ?? ""),
    nome: item.nome ?? "",
    cat: categoria(item.categoria ?? "", item.nome ?? ""),
    espec: [item.marca, item.codigo ? `Cód. ${item.codigo}` : ""].filter(Boolean).join(" · "),
    placa: item.marca ?? "",
    foto: item.foto_url ?? "",
    preco: preco > 0 ? preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    estoque: estoque == null ? null : Math.max(0, Number(estoque) || 0),
    desc: item.descricao ?? ""
  };
}

// ===== Agrupamento do site =====
// Junta os ~40 grupos do Noturno em poucas categorias. Produtos do grupo
// DIVERSOS/GERAIS são separados pelo NOME. O que não se encaixa vira "diversos"
// (itens de uso interno da loja) e fica escondido do site.
function norm(t) { return String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }

const GRUPOS = {
  lavagem: ["TOALHA","BOINA","ODORIZANTE","APLICADOR","VETRIFICADOR","CANHAO DE ESPUMA","APC","PULVERIZADOR","LUVA","BALDE","ESCOVA","POLIDOR","REVITALIZADOR PLASTICO","PISO","CANETA"],
  acessorios: ["BICO JATO","CONEXAO ADAPTADORA","GANCHO","CARRINHO"],
  pecas: ["ROLAMENTO","CILINDRO MESTRE EMBREAGEM","BICO INJETOR","RETENTORES","TENSOR CORREIA","CAIXA DIRECAO","ARTICULACAO AXIAL","BOBINA IGNICAO","BUCHA COMANDO VALVULA","COLUNA DIRECAO","PARAFUSO FIXACAO","PIVO SUSPENSAO","MOLA","ABRACADEIRAS DIVERSAS","MANGUEIRAS","COLA"]
};
// palavras no NOME (para os produtos do grupo DIVERSOS/GERAIS); a ordem importa
const PALAVRAS = [
  ["pecas", /\b(PASTILHA|BUCHA|ROLAMENTO|ROL|FILTRO|SAPATA|CILINDRO|LAMPADA|FAROL|FAR|CRUZETA|CUBO|RET|RETENTOR|RENTENTOR|CORRENTE|FLANGE|DEFLETOR|GUIA|MOLA|VELA|BARRA|REPARO|AMORT|AMORTECEDOR|BOMBA|CALOTA|CARTER|LANTERNA|TERMINAL|CHICOTE|BIELETA|BOBINA|JUNTA|PINO|PIVO|CABECOTE|ATUADOR|CORREIA|PALHETA|CAMISA|COXIM|DISCO|TAMPA|PARAFUSO|PARAF|REBITE|ARRUELA|PRESILHA|GRAMPO|CLIPS|ABRAC|ABRACADEIRA|MANG|MANGUEIRA|SENSOR|VALVULA|EMBREAGEM|EMBR|PLATO|ESTABILIZADOR|BANDEJA|RADIADOR|TENSOR|POLIA|SUSPENSAO|SUSP|HOMOCINETICA|TRIZETA|RETROVISOR|MACANETA|FECHADURA|CONECTOR|BICO INJETOR|SEMI|EIXO|ROLDANA|COIFA|BATENTE|TUBO|MOTOR|RELE|FUSIVEL|INTERRUPTOR|ALTERNADOR|ARRANQUE|ESCAPAMENTO|SILENCIOSO|CATALISADOR|VOLANTE|FREIO|LONA|TAMBOR|PISTAO|BIELA|ANEL|BRONZINA|COMANDO|TUCHO|CABO|SELANTE|COLA|ARALDITE|BLOCO|CAIXA)\b/],
  ["acessorios", /\bBICO (LAVAGEM|ENGATE|GERADOR|JATO|ESPUMA|PULVERIZADOR)\b/],
  ["pecas", /\b(BICO|AUTOMATICO|RESERVATORIO|SONDA|LAMP|TURBO|CIL|SEMIEIXO|ARTICULACAO|CAMBIO|VENTILADOR|GARGALO|LIMITADOR|TRAVA|LOCKER|ARR|CARCACA|BOCAL|BUJAO|COLAR|PORCA|ESPELHO|PEDAL|SUPORTE MOTOR|IGNICAO|INJ|VELAS|PARABRISA|IWP\d*|RODA|SX)\b/],
  ["oleos", /\b(DESCARBONIZANTE|DESMINERALIZADA|ARLA)\b/],
  ["lavagem", /\b(GLASS|POLIR|MASSA|SUPRA|SANDET|DARKER|MICROLAV|PLP|BRILHO|DET|DESINCRUSTANTE|DESENENGRAXANTE|IMPER|ESTOPA|VASELINA|CLAYBAR|ALCOOL|PNCEL|EXTRACTUS|GLAZY|MITTUS|REVELAX|SINERGY|SOFT|ZUCS|SANITIZANTE|AUTOLIMPE|LAVAGEM|PNEUS|BORRACHAS|PLASTICO|PLASTICOS|COURO|ESTOFADO|TECIDO|CARPETE|MOTOR LIMPO|ODOR|PERFUME|CHEIRINHO|BRILHA|BRILHANTE|SPRAY ACABAMENTO|SNOW|FOAM|RESTAURA|MULTIUSO)\b/],
  ["oleos", /\b(OLEO|ADITIVO|FLUIDO|GRAXA|DESENGRIPANTE|ARLA|LUBRIFICANTE|ARREFECIMENTO)\b/],
  ["lavagem", /\b(LIMPA|LIMPADOR|TOALHA|BOINA|ESCOVA|APLICADOR|AROMA|AROMATIZANTE|ODORIZANTE|ESPONJA|PANO|CLAY|POLITRIZ|BRIGHT|CERA|SHAMPOO|SABAO|DETERGENTE|VITRIFICADOR|VETRIFICADOR|PRETINHO|REVITALIZADOR|POLIDOR|COMPOSTO|LUVA|MICROFIBRA|PINCEL|BORRIFADOR|PULVERIZADOR|APC|DESENGRAXANTE|LAVA|ESTETICA|DETAILER|DIFUSOR|REFIL|SPEEDY|VEXUS|SECANTE|SILICONE|HIDRATANTE|PROTETOR|PNEU|DESCONTAMINANTE|REMOVEDOR|ESPUMA|FLANELA|CHAMOIS|BALDE|ACID|SELADOR|NANO|COATING|QUARTZO|INTERNO|VIDRO|VIDROS)\b/],
  ["acessorios", /\b(BICO|PISTOLA|SUPORTE|GANCHO|BANQUETA|CARRINHO|CARRO|PROLONGADOR|ADAPT|ADAPTADOR|ENGATE|CONEXAO|TINTA|FITA|CHAVE|PINCEIS|LANTERNA|TAPETE|CAPA|ORGANIZADOR|EXTENSAO|COMPRESSOR|ASPIRADOR|LAVADORA|MAQUINA|ENGATE|MANOMETRO|REGISTRO|JOELHO|TEE|ESPIGAO|UNIAO|ENG RAPIDO|LAVADORA)\b/]
];
// Produtos específicos que a loja confirmou que vende (nome começa com...)
const FORCAR = [
  ["pecas", /^(KIT FIXACAO BANCO|ESPAGUETE CORRUGADO|FIO 1 00|PONTEIRA DIVERSOS|REGULADOR DIVERSOS|RESERV AGUA)/],
  ["lavagem", /^(ADITIVADO FINISHER)/],
  ["acessorios", /^(MANTA ASFALTICA|THINNER|APARELHO MECANICO PULV|PIGMENTO ORGANICO|COLETE SALVA VIDAS|CAPACETE|BOTA DE BORRACHA|TENDA GAZEBO)/]
];

function agrupar(grupo, nome) {
  const g = norm(grupo), n = norm(nome).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [cat, re] of FORCAR) if (re.test(n)) return cat;
  if (/LAV|ESTET|LIMP|CERA|SHAMP|PNEU|RODA/.test(g)) return "lavagem";
  if (/PECA|FILTRO|FREIO|LAMP|PALHET/.test(g)) return "pecas";
  for (const [cat, lista] of Object.entries(GRUPOS)) if (lista.includes(g)) return cat;
  if (/OLEO|FLUID|ADITIV|LUBRI/.test(g)) return /\b(BOMBA|FILTRO)\b/.test(n) ? "pecas" : "oleos";
  if (/ACESS/.test(g)) return "acessorios";
  for (const [cat, re] of PALAVRAS) if (re.test(n)) return cat;
  return "diversos";
}
function categoria(grupo, nome) { return agrupar(grupo, nome); }
