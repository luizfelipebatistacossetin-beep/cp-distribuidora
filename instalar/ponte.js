// =====================================================================
//  PONTE CP DISTRIBUIDORA
//  Copia os produtos do Noturno ERP (neste servidor) para o Supabase,
//  de onde o site cp-distribuidora.vercel.app lê o catálogo.
//
//  Como usar (no PowerShell, dentro de C:\PonteCP):
//    node ponte.js teste      -> só consulta o Noturno e mostra o que veio
//    node ponte.js uma-vez    -> faz UMA sincronização completa
//    node ponte.js            -> fica rodando, sincronizando a cada X minutos
//    node ponte.js fotos      -> SÓ envia fotos (para o computador do ESTOQUE),
//                                fica rodando a cada X minutos
//    node ponte.js fotos-uma-vez -> envia as fotos UMA vez (para testar)
//
//  Tudo que muda de loja para loja fica no config.txt (não mexa aqui).
// =====================================================================

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const PASTA = __dirname;
const ARQ_LOG = path.join(PASTA, "ponte.log");
const ARQ_FOTOS = path.join(PASTA, "fotos-enviadas.json");
const ARQ_RESPOSTA = path.join(PASTA, "resposta-noturno.json");

// ---------------------------------------------------------------- config
function lerConfig() {
  const arq = path.join(PASTA, "config.txt");
  if (!fs.existsSync(arq)) sair("Não achei o config.txt na pasta " + PASTA);
  const cfg = {};
  for (const linha of fs.readFileSync(arq, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 1) continue;
    cfg[l.slice(0, i).trim().toUpperCase()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  const so_fotos = (process.argv[2] || "").toLowerCase().startsWith("fotos");
  const obrigatorios = so_fotos ? ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] : ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "NOTURNO_URL", "NOTURNO_CLIENT_ID"];
  for (const k of obrigatorios) {
    if (!cfg[k] || cfg[k].startsWith("COLE_")) sair(`Falta preencher ${k} no config.txt`);
  }
  cfg.SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/+$/, "");
  cfg.MINUTOS = Math.max(1, Number(cfg.MINUTOS || 5));
  cfg.PASTA_FOTOS = cfg.PASTA_FOTOS || "C:\\NoturnoSysUtils\\Photos";
  cfg.NOTURNO_METODO = (cfg.NOTURNO_METODO || "GET").toUpperCase();
  return cfg;
}

// ---------------------------------------------------------------- utilidades
function agora() { return new Date().toLocaleString("pt-BR"); }
function log(msg) {
  const linha = `[${agora()}] ${msg}`;
  console.log(linha);
  try {
    // log não passa de ~2 MB
    if (fs.existsSync(ARQ_LOG) && fs.statSync(ARQ_LOG).size > 2e6) fs.renameSync(ARQ_LOG, ARQ_LOG + ".antigo");
    fs.appendFileSync(ARQ_LOG, linha + "\n");
  } catch {}
}
function sair(msg) { log("ERRO: " + msg); process.exit(1); }

function requisicao(url, { metodo = "GET", headers = {}, corpo = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const dados = corpo == null ? null : (Buffer.isBuffer(corpo) ? corpo : Buffer.from(typeof corpo === "string" ? corpo : JSON.stringify(corpo)));
    const req = lib.request(u, {
      method: metodo,
      headers: { ...headers, ...(dados ? { "Content-Length": dados.length } : {}) },
      timeout: 120000
    }, res => {
      const partes = [];
      res.on("data", c => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode, texto: Buffer.concat(partes).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado (120 s)")));
    req.on("error", reject);
    if (dados) req.write(dados);
    req.end();
  });
}

// ---------------------------------------------------------------- Noturno
async function buscarNoturno(cfg) {
  const corpo = cfg.NOTURNO_CONSULTA ? cfg.NOTURNO_CONSULTA : null;
  const r = await requisicao(cfg.NOTURNO_URL, {
    metodo: cfg.NOTURNO_METODO,
    headers: { "Content-Type": "application/json", Accept: "application/json", client_id: cfg.NOTURNO_CLIENT_ID },
    corpo
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Noturno respondeu ${r.status}: ${r.texto.slice(0, 500)}`);
  let json;
  try { json = JSON.parse(r.texto); } catch { throw new Error("Noturno não respondeu em JSON: " + r.texto.slice(0, 500)); }
  return json;
}

// acha a maior lista de objetos dentro da resposta, onde quer que ela esteja
function acharLista(json) {
  let melhor = [];
  (function andar(v, prof) {
    if (prof > 6 || v == null) return;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === "object" && !Array.isArray(v[0]) && v.length > melhor.length) melhor = v;
      v.forEach(x => andar(x, prof + 1));
    } else if (typeof v === "object") Object.values(v).forEach(x => andar(x, prof + 1));
  })(json, 0);
  return melhor;
}

// nomes de campo prováveis; dá para forçar no config.txt (CAMPO_ID=..., etc.)
const CANDIDATOS = {
  ID: ["id", "id_produto", "idproduto", "produto_id", "cod_interno", "codigo_interno", "codinterno", "idprod", "seq", "sequencial"],
  CODIGO: ["codigo", "cod", "codigo_produto", "codproduto", "referencia", "ref", "sku", "codigo_barras", "ean", "gtin"],
  NOME: ["descricao", "nome", "produto", "nome_produto", "desc_produto", "descricao_produto", "descr"],
  DESCRICAO: ["observacao", "obs", "descricao_longa", "detalhes", "complemento", "aplicacao"],
  CATEGORIA: ["grupo", "categoria", "departamento", "secao", "familia", "subgrupo", "nome_grupo", "desc_grupo"],
  MARCA: ["marca", "fabricante", "nome_marca", "desc_marca"],
  PRECO: ["preco_venda", "precovenda", "pr_venda", "preco", "valor_venda", "vlr_venda", "valor", "venda", "preco1"],
  ESTOQUE: ["estoque_disponivel", "estoquedisponivel", "estoque", "saldo", "qtd_estoque", "quantidade", "qtde", "qtd", "estoque_atual", "saldo_estoque", "disponivel"],
  ATIVO: ["ativo", "situacao", "status", "inativo"]
};
function normal(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function descobrirCampos(exemplo, cfg) {
  const chaves = Object.keys(exemplo);
  const porNormal = Object.fromEntries(chaves.map(k => [normal(k), k]));
  const mapa = {};
  for (const [alvo, lista] of Object.entries(CANDIDATOS)) {
    const forcado = cfg["CAMPO_" + alvo];
    if (forcado) { mapa[alvo] = forcado; continue; }
    for (const c of lista) { const k = porNormal[normal(c)]; if (k) { mapa[alvo] = k; break; } }
  }
  if (!mapa.ID && mapa.CODIGO) mapa.ID = mapa.CODIGO;
  return mapa;
}

function numero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function ativo(v, campo) {
  if (v == null) return true;
  const s = normal(v);
  if (campo && normal(campo) === "inativo") return !(s === "true" || s === "1" || s === "s" || s === "sim");
  return !["false", "0", "n", "nao", "inativo", "i", "bloqueado", "excluido", "cancelado"].includes(s);
}
function texto(v) { return v == null ? null : String(v).trim() || null; }

function idPeloNome(nome) {
  // sem código vindo do Noturno: usa o nome como identificação
  return "N-" + normal(nome || "").slice(0, 120);
}

function converter(item, mapa) {
  const nome = texto(item[mapa.NOME]);
  return {
    id_interno: mapa.ID ? texto(item[mapa.ID]) : (nome ? idPeloNome(nome) : null),
    codigo: texto(item[mapa.CODIGO]),
    nome,
    descricao: mapa.DESCRICAO ? texto(item[mapa.DESCRICAO]) : null,
    categoria: mapa.CATEGORIA ? texto(item[mapa.CATEGORIA]) : null,
    marca: mapa.MARCA ? texto(item[mapa.MARCA]) : null,
    preco: mapa.PRECO ? numero(item[mapa.PRECO]) : null,
    estoque: mapa.ESTOQUE ? numero(item[mapa.ESTOQUE]) : null,
    ativo: mapa.ATIVO ? ativo(item[mapa.ATIVO], mapa.ATIVO) : true
  };
}

// ---------------------------------------------------------------- Supabase
function cabSupabase(cfg, extra = {}) {
  const k = cfg.SUPABASE_SECRET_KEY;
  // chaves antigas (service_role, começam com eyJ) também precisam do Authorization
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: "Bearer " + k } : {}), ...extra };
}

async function enviarProdutos(cfg, produtos) {
  for (let i = 0; i < produtos.length; i += 500) {
    const lote = produtos.slice(i, i + 500);
    const r = await requisicao(`${cfg.SUPABASE_URL}/rest/v1/produtos?on_conflict=id_interno`, {
      metodo: "POST",
      headers: cabSupabase(cfg, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      corpo: lote
    });
    if (r.status >= 300) throw new Error(`Supabase recusou os produtos (${r.status}): ${r.texto.slice(0, 500)}`);
  }
}

// produtos que sumiram do Noturno saem do site (ficam inativos)
async function desativarAntigos(cfg, inicio) {
  const r = await requisicao(`${cfg.SUPABASE_URL}/rest/v1/produtos?atualizado_em=lt.${encodeURIComponent(inicio)}&ativo=eq.true`, {
    metodo: "PATCH",
    headers: cabSupabase(cfg, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    corpo: { ativo: false }
  });
  if (r.status >= 300) throw new Error(`Supabase recusou desativar antigos (${r.status}): ${r.texto.slice(0, 300)}`);
}

// ---------------------------------------------------------------- fotos
// Lê a pasta de fotos uma vez por rodada. Aceita PRODUTO_<id> com qualquer
// combinação de maiúsculas/minúsculas e as extensões abaixo.
const EXTENSOES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jfif": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp" };
let mapaFotos = null;
function lerPastaFotos(cfg) {
  mapaFotos = new Map();
  try {
    for (const nome of fs.readdirSync(cfg.PASTA_FOTOS)) {
      const ext = path.extname(nome).toLowerCase();
      if (!EXTENSOES[ext]) continue;
      const base = path.basename(nome, path.extname(nome)).trim().toUpperCase();
      const arq = path.join(cfg.PASTA_FOTOS, nome);
      const atual = mapaFotos.get(base);
      // se houver duas fotos do mesmo produto, fica a mais recente
      if (!atual || fs.statSync(arq).mtimeMs > fs.statSync(atual).mtimeMs) mapaFotos.set(base, arq);
    }
  } catch (e) { log("Aviso: não consegui ler a pasta de fotos " + cfg.PASTA_FOTOS + ": " + e.message); }
  return mapaFotos;
}
function acharFoto(cfg, id) {
  if (!mapaFotos) lerPastaFotos(cfg);
  return mapaFotos.get(`PRODUTO_${String(id).trim().toUpperCase()}`) || null;
}

// COMO O NOTURNO NOMEIA AS FOTOS
//  - Servidor (Recover Image): PRODUTO_<id>.jpg  -> foto oficial do produto <id>
//  - PCs de cadastro (ESTOQUE, Wender...): PRODUTO_<id><n>.jpg, onde <n> é o
//    número da foto (0 = Foto 01). Ex.: produto 1090 -> PRODUTO_10900.jpg
// Por isso os PCs de cadastro enviam com o prefixo "C_" (C_PRODUTO_10900.jpg)
// e o servidor sabe que ali o último dígito é o número da foto.

// Envia as fotos novas/alteradas da pasta. prefixo = "" (servidor) ou "C_" (PCs de cadastro)
async function enviarFotosDaPasta(cfg, prefixo = "") {
  lerPastaFotos(cfg);
  let enviadas = {}, primeiraVez = false;
  try { enviadas = JSON.parse(fs.readFileSync(ARQ_FOTOS, "utf8")); } catch { primeiraVez = true; }
  const limiteInicio = primeiraVez && cfg.DIAS_INICIO ? Date.now() - Number(cfg.DIAS_INICIO) * 86400000 : 0;
  const doisDias = Date.now() - 2 * 86400000;
  let novas = 0, falhas = 0;
  for (const [base, arq] of mapaFotos) {
    if (!base.startsWith("PRODUTO_")) continue;
    const nomeArq = path.basename(arq).replace(/[^A-Za-z0-9_.-]/g, "_");
    const nomeDestino = prefixo + nomeArq;
    let st; try { st = fs.statSync(arq); } catch { continue; }
    const marca = st.mtimeMs + ":" + st.size;
    if (enviadas[nomeDestino] === marca) continue;
    // migração: foto antiga já enviada com o nome velho (sem C_) não é reenviada
    if (prefixo && enviadas[nomeArq] === marca && st.mtimeMs < doisDias) { enviadas[nomeDestino] = marca; continue; }
    if (limiteInicio && st.mtimeMs < limiteInicio) { enviadas[nomeDestino] = marca; continue; }
    const tipo = EXTENSOES[path.extname(arq).toLowerCase()] || "image/jpeg";
    try {
      const r = await requisicao(`${cfg.SUPABASE_URL}/storage/v1/object/fotos/${nomeDestino}`, {
        metodo: "POST",
        headers: cabSupabase(cfg, { "Content-Type": tipo, "x-upsert": "true", "cache-control": "3600" }),
        corpo: fs.readFileSync(arq)
      });
      if (r.status >= 300) throw new Error(`${r.status} ${r.texto.slice(0, 200)}`);
      enviadas[nomeDestino] = marca; novas++;
    } catch (e) { falhas++; if (falhas <= 3) log(`Aviso: não enviou a foto ${nomeDestino}: ${e.message}`); }
  }
  try { fs.writeFileSync(ARQ_FOTOS, JSON.stringify(enviadas)); } catch {}
  return { novas, falhas };
}

// Lista as fotos do Supabase: "NOME_SEM_EXTENSAO" -> { url, quando }
async function fotosNoSupabase(cfg) {
  const mapa = new Map();
  for (let offset = 0; ; offset += 1000) {
    const r = await requisicao(`${cfg.SUPABASE_URL}/storage/v1/object/list/fotos`, {
      metodo: "POST",
      headers: cabSupabase(cfg, { "Content-Type": "application/json" }),
      corpo: { prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }
    });
    if (r.status >= 300) throw new Error(`Supabase recusou listar as fotos (${r.status}): ${r.texto.slice(0, 200)}`);
    const lista = JSON.parse(r.texto);
    for (const o of lista) {
      if (!o || !o.name || !o.id) continue;
      if (!EXTENSOES[path.extname(o.name).toLowerCase()]) continue;
      const base = path.basename(o.name, path.extname(o.name)).toUpperCase();
      const quando = Date.parse(o.updated_at || o.created_at || 0) || 0;
      const atual = mapa.get(base);
      if (atual && atual.quando >= quando) continue;
      mapa.set(base, { quando, url: `${cfg.SUPABASE_URL}/storage/v1/object/public/fotos/${encodeURIComponent(o.name)}?v=${quando}` });
    }
    if (lista.length < 1000) break;
  }
  return mapa;
}

// Servidor: escolhe a foto de cada produto.
//  1) a do próprio servidor (PRODUTO_<id>, vinda do Recover), se existir na pasta dele;
//  2) a Foto 01 enviada por um PC de cadastro (C_PRODUTO_<id>0);
//  vale a mais recente das duas.
async function enviarFotos(cfg, produtos) {
  const r = await enviarFotosDaPasta(cfg, "");
  let mapa;
  try { mapa = await fotosNoSupabase(cfg); }
  catch (e) { log("Aviso: " + e.message); mapa = null; }
  // tamanho de cada foto da pasta do servidor (para achar cópias)
  const tam = (base) => { const a = mapaFotos.get(base); if (!a) return -1; try { return fs.statSync(a).size; } catch { return -1; } };
  const ids = new Set(produtos.map(p => String(p.id_interno).trim().toUpperCase()));
  for (const p of produtos) {
    if (!mapa) { delete p.foto_url; continue; }
    const id = String(p.id_interno).trim().toUpperCase();
    // O Noturno grava PRODUTO_<id>.jpg (principal) e PRODUTO_<id><n>.jpg (Foto n+1).
    // Os nomes se confundem: PRODUTO_3260 pode ser o produto 3260 OU a Foto 01 do 326.
    let principal = mapaFotos.has(`PRODUTO_${id}`) ? `PRODUTO_${id}` : null;
    if (principal && /0$/.test(id)) {
      const pai = id.slice(0, -1);
      // se for idêntica à foto do produto "pai", é a Foto 01 dele, não deste produto
      if (tam(`PRODUTO_${pai}`) === tam(principal)) principal = null;
    }
    let foto1 = mapaFotos.has(`PRODUTO_${id}0`) && !ids.has(`${id}0`) ? `PRODUTO_${id}0` : null;
    const escolhido = principal || foto1;
    const doServidor = escolhido ? mapa.get(escolhido) : null;
    const doCadastro = mapa.get(`C_PRODUTO_${id}0`) || null;
    let melhor = doServidor;
    if (doCadastro && (!melhor || doCadastro.quando > melhor.quando)) melhor = doCadastro;
    p.foto_url = melhor ? melhor.url : null;
  }
  return r;
}

// PCs de cadastro (ESTOQUE, Wender...): só enviam as fotos novas, com prefixo C_.
async function soFotos(cfg) {
  const r = await enviarFotosDaPasta(cfg, "C_");
  log(`OK (só fotos): ${r.novas} fotos novas${r.falhas ? `, ${r.falhas} com erro` : ""}. Pasta: ${cfg.PASTA_FOTOS}`);
}

// ---------------------------------------------------------------- modos
async function teste(cfg) {
  log("Consultando o Noturno em " + cfg.NOTURNO_URL + " ...");
  const json = await buscarNoturno(cfg);
  fs.writeFileSync(ARQ_RESPOSTA, JSON.stringify(json, null, 2));
  const lista = acharLista(json);
  console.log("\n================ RESULTADO DO TESTE ================");
  console.log(`Resposta completa salva em: ${ARQ_RESPOSTA}`);
  console.log(`Itens encontrados: ${lista.length}`);
  if (!lista.length) {
    console.log("\nNão veio nenhuma lista de produtos. Início da resposta:\n");
    console.log(JSON.stringify(json, null, 2).slice(0, 1500));
    console.log("\n>> Tire um print desta tela e mande para o Claude.");
    return;
  }
  const mapa = descobrirCampos(lista[0], cfg);
  console.log("\nPrimeiro item, como veio do Noturno:\n");
  console.log(JSON.stringify(lista[0], null, 2).slice(0, 1500));
  console.log("\nCampos que a ponte entendeu:");
  for (const k of Object.keys(CANDIDATOS)) console.log(`  ${k.padEnd(10)} -> ${mapa[k] || "(não achei)"}`);
  const ex = converter(lista[0], mapa);
  console.log("\nComo esse produto vai aparecer no site:");
  console.log(`  Nome: ${ex.nome}\n  Código: ${ex.codigo}\n  Preço: ${ex.preco}\n  Estoque: ${ex.estoque}\n  Grupo: ${ex.categoria}`);
  const foto = ex.id_interno ? acharFoto(cfg, ex.id_interno) : null;
  console.log(`  Foto: ${foto || "(não achei PRODUTO_" + ex.id_interno + ".jpg)"}`);
  const ok = !!mapa.NOME;
  if (ok && !mapa.ID) console.log("\n(Sem código no Noturno: a ponte vai usar o NOME para identificar o produto. Funciona, mas sem fotos.)");
  console.log(ok
    ? "\n>> Tudo certo para sincronizar. Tire um print desta tela e mande para o Claude conferir os campos."
    : "\n>> Faltou achar o NOME. Tire um print desta tela e mande para o Claude.");
  console.log("====================================================\n");
}

async function sincronizar(cfg) {
  const inicio = new Date().toISOString();
  const json = await buscarNoturno(cfg);
  const lista = acharLista(json);
  if (!lista.length) throw new Error("O Noturno respondeu, mas sem lista de produtos. Rode: node ponte.js teste");
  const mapa = descobrirCampos(lista[0], cfg);
  if (!mapa.NOME) throw new Error("Não identifiquei o campo de NOME. Rode: node ponte.js teste");

  const vistos = new Set();
  const produtos = [];
  for (const item of lista) {
    const p = converter(item, mapa);
    if (!p.id_interno || !p.nome || vistos.has(p.id_interno)) continue;
    vistos.add(p.id_interno);
    p.atualizado_em = inicio;
    produtos.push(p);
  }
  // segurança: se vier quase vazio de repente, não apaga o catálogo
  if (produtos.length < 5 && lista.length > 0 && !cfg.PERMITIR_POUCOS) {
    log(`Aviso: vieram só ${produtos.length} produtos. Enviando, mas sem desativar os antigos.`);
  }
  const fotos = await enviarFotos(cfg, produtos);
  // se a lista de fotos falhou, todos ficam sem foto_url e a gente não mexe nelas
  if (produtos.some(p => !("foto_url" in p))) for (const p of produtos) delete p.foto_url;
  await enviarProdutos(cfg, produtos);
  if (produtos.length >= 5 || cfg.PERMITIR_POUCOS) await desativarAntigos(cfg, inicio);
  const ativos = produtos.filter(p => p.ativo).length;
  log(`OK: ${produtos.length} produtos enviados (${ativos} ativos), ${fotos.novas} fotos novas${fotos.falhas ? `, ${fotos.falhas} fotos com erro` : ""}.`);
}

async function principal() {
  const modo = (process.argv[2] || "").toLowerCase();
  const cfg = lerConfig();
  if (modo === "teste") return teste(cfg);
  if (modo === "uma-vez") return sincronizar(cfg);
  if (modo === "fotos-uma-vez") return soFotos(cfg);
  if (modo === "fotos") {
    log(`Ponte de FOTOS ligada. Olhando ${cfg.PASTA_FOTOS} a cada ${cfg.MINUTOS} minutos.`);
    for (;;) {
      try { await soFotos(cfg); }
      catch (e) { log("ERRO: " + e.message + " (tento de novo na próxima rodada)"); }
      await new Promise(r => setTimeout(r, cfg.MINUTOS * 60000));
    }
  }

  log(`Ponte ligada. Sincronizando a cada ${cfg.MINUTOS} minutos.`);
  for (;;) {
    try { await sincronizar(cfg); }
    catch (e) { log("ERRO: " + e.message + " (tento de novo na próxima rodada)"); }
    await new Promise(r => setTimeout(r, cfg.MINUTOS * 60000));
  }
}

principal().catch(e => sair(e.message));
