// Lista os pedidos para a página admin.html. Protegido por senha (ADMIN_PASSWORD).
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const same = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash("sha256").update(String(a)).digest(),
    crypto.createHash("sha256").update(String(b)).digest()
  );

exports.handler = async (event) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return json(500, { error: "ADMIN_PASSWORD não configurada na Netlify." });

  if (!same(event.headers["x-admin-password"] || "", pass)) {
    await new Promise((r) => setTimeout(r, 800));
    return json(401, { error: "Senha incorreta." });
  }

  connectLambda(event);
  const store = getStore("orders");
  const { blobs } = await store.list();
  const keys = blobs.map((x) => x.key).sort().reverse().slice(0, 200);
  const orders = (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
  return json(200, { orders });
};
