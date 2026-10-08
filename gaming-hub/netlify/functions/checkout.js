const { connectLambda, getStore } = require("@netlify/blobs");

// Cria o link de pagamento na InfinitePay. Os preços ficam AQUI (em centavos),
// para ninguém conseguir alterar o valor pelo navegador.
// Se mudar um preço, mude também no index.html.
const PRODUCTS = {
  ranger: { name: "Gaming Hub Ranger", price: 100 },
  titan:  { name: "Gaming Hub Titan",  price: 1299900 },
  apex:   { name: "Gaming Hub Apex",   price: 2299900 },
  scout:  { name: "Gaming Hub Scout",  price: 1899900 },
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const digits = (s) => String(s || "").replace(/\D/g, "");
const text = (s, max) => String(s || "").trim().slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método não permitido." });

  connectLambda(event);
  const handle = process.env.INFINITEPAY_HANDLE;
  if (!handle) return json(500, { error: "INFINITEPAY_HANDLE não configurado." });

  let input;
  try { input = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Pedido inválido." }); }

  const { items, customer: c = {} } = input;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10)
    return json(400, { error: "Carrinho inválido." });

  const lines = [];
  for (const it of items) {
    const p = PRODUCTS[it && it.id];
    const q = Number(it && it.quantity);
    if (!p || !Number.isInteger(q) || q < 1 || q > 5)
      return json(400, { error: "Produto ou quantidade inválidos." });
    lines.push({ quantity: q, price: p.price, description: p.name });
  }

  const phone = digits(c.phone);
  const cep = digits(c.cep);
  if (!text(c.name, 120) || !/^\S+@\S+\.\S+$/.test(c.email || "") || phone.length < 10 ||
      cep.length !== 8 || !text(c.street, 120) || !text(c.number, 20) || !text(c.neighborhood, 80))
    return json(400, { error: "Dados de entrega incompletos." });

  const site = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
  const order_nsu = "gh-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

  const payload = {
    handle,
    order_nsu,
    items: lines,
    customer: {
      name: text(c.name, 120),
      email: text(c.email, 120),
      phone_number: "+" + (phone.length <= 11 ? "55" + phone : phone),
    },
    address: {
      cep,
      street: text(c.street, 120),
      neighborhood: text(c.neighborhood, 80),
      number: text(c.number, 20),
      complement: text(c.complement, 80),
    },
  };
  if (site) {
    payload.redirect_url = site + "/";
    payload.webhook_url = site + "/.netlify/functions/webhook";
  }

  // Guarda o pedido antes de mandar o cliente pagar: assim toda venda tem registro.
  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  try {
    await getStore("orders").setJSON(order_nsu, {
      order_nsu, status: "aguardando", createdAt: new Date().toISOString(),
      total, items: lines, customer: payload.customer, address: payload.address,
    });
  } catch (err) {
    console.error("Falha ao salvar o pedido:", err);
    return json(500, { error: "Não foi possível registrar o pedido." });
  }

  try {
    const res = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    const url = data.url || data.link || data.checkout_url;
    if (!res.ok || !url) {
      console.error("InfinitePay recusou o pedido:", res.status, JSON.stringify(data));
      return json(502, { error: "Não foi possível criar o pagamento." });
    }
    return json(200, { url, order_nsu });
  } catch (err) {
    console.error("Falha ao chamar a InfinitePay:", err);
    return json(502, { error: "Não foi possível criar o pagamento." });
  }
};
