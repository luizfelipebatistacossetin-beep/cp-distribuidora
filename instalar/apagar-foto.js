// Apaga uma foto do armazenamento do site. Uso: node apagar-foto.js K_PRODUTO_32140.jpg
const fs = require("fs"), https = require("https");
const cfg = {};
for (const l of fs.readFileSync("C:\\PonteCPFotos\\config.txt", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) cfg[m[1]] = m[2];
}
const nome = process.argv[2];
if (!/^[KC]_PRODUTO_\d+\.jpg$/i.test(nome || "")) { console.log("Nome invalido."); process.exit(1); }
const k = cfg.SUPABASE_SECRET_KEY;
const h = { apikey: k, "Content-Type": "application/json" };
if (k.startsWith("eyJ")) h.Authorization = "Bearer " + k;
const corpo = JSON.stringify({ prefixes: [nome] });
const u = new URL(cfg.SUPABASE_URL + "/storage/v1/object/fotos");
const r = https.request(u, { method: "DELETE", headers: { ...h, "Content-Length": Buffer.byteLength(corpo) } }, res => {
  let t = ""; res.on("data", d => t += d); res.on("end", () => console.log(res.statusCode, t.slice(0, 200)));
});
r.on("error", e => console.log("ERRO", e.message)); r.end(corpo);
