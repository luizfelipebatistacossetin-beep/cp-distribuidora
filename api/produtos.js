// Função da Vercel: busca os produtos no sistema da loja (Noturno ERP)
// e entrega para o site no endereço /api/produtos.
//
// A senha/chave da API NUNCA fica aqui no código. Ela fica nas configurações
// do projeto na Vercel (Settings > Environment Variables):
//   NOTURNO_API_URL   endereço da API que a Noturno passar
//   NOTURNO_TOKEN     chave de acesso que a Noturno passar
//
// Enquanto essas duas não existirem, a função responde "não configurado"
// e o site continua mostrando o catálogo de demonstração.
//
// IMPORTANTE: a parte "converter" abaixo é um palpite. Quando chegar a
// documentação da API, é só ajustar os nomes dos campos nela.

const MINUTOS_CACHE = 15; // de quanto em quanto tempo o site pergunta de novo ao sistema

module.exports = async (req, res) => {
  const url = process.env.NOTURNO_API_URL;
  const token = process.env.NOTURNO_TOKEN;

  if (!url || !token) {
    res.status(503).json({ erro: "Integração com o sistema da loja ainda não configurada." });
    return;
  }

  try {
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!resposta.ok) throw new Error(`Sistema respondeu ${resposta.status}`);

    const bruto = await resposta.json();
    const lista = Array.isArray(bruto) ? bruto : (bruto.produtos || bruto.data || bruto.items || []);
    const produtos = lista.map(converter).filter(p => p.id && p.nome && p.ativo !== false);

    // A Vercel guarda a resposta por alguns minutos: o sistema da loja é
    // consultado no máximo a cada MINUTOS_CACHE, não a cada visita.
    res.setHeader("Cache-Control", `s-maxage=${MINUTOS_CACHE * 60}, stale-while-revalidate=3600`);
    res.status(200).json({ atualizadoEm: new Date().toISOString(), produtos });
  } catch (e) {
    console.error("Falha ao buscar produtos no Noturno:", e);
    res.status(502).json({ erro: "Não foi possível falar com o sistema da loja agora." });
  }
};

// Transforma um produto do formato do Noturno no formato que o site usa.
// AJUSTAR quando a documentação chegar (os nomes à direita são chutes).
function converter(item) {
  const preco = Number(item.preco_venda ?? item.preco ?? item.valor ?? 0);
  const estoque = item.estoque ?? item.saldo ?? item.quantidade;
  return {
    id: String(item.codigo ?? item.id ?? ""),
    nome: item.descricao ?? item.nome ?? "",
    cat: categoria(item.grupo ?? item.categoria ?? ""),
    espec: item.unidade ? `Unidade: ${item.unidade}` : (item.embalagem ?? ""),
    placa: item.unidade ?? "",
    foto: item.foto_url ?? item.imagem ?? "",
    preco: preco > 0 ? preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    estoque: estoque == null ? null : Math.max(0, Number(estoque) || 0),
    desc: item.observacao ?? item.descricao_longa ?? "",
    ativo: item.ativo
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
