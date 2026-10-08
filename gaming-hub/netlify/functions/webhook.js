// A InfinitePay avisa aqui quando um pagamento é aprovado.
// Antes de marcar como pago, confirmamos de novo com a InfinitePay (payment_check).
const { connectLambda, getStore } = require("@netlify/blobs");

const reply = (statusCode, body) => ({ statusCode, body });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, "método não permitido");
  connectLambda(event);

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return reply(400, "pedido inválido"); }

  const store = getStore("orders");
  const order = await store.get(String(b.order_nsu || ""), { type: "json" });
  if (!order) {
    console.error("Webhook para pedido desconhecido:", b.order_nsu);
    return reply(200, "ok");
  }

  let check;
  try {
    const res = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: process.env.INFINITEPAY_HANDLE,
        order_nsu: order.order_nsu,
        transaction_nsu: b.transaction_nsu,
        slug: b.invoice_slug,
      }),
    });
    check = await res.json();
  } catch (err) {
    console.error("Falha ao confirmar pagamento:", err);
    return reply(400, "tente novamente"); // a InfinitePay reenvia
  }

  if (!check || check.paid !== true) {
    console.error("Pagamento não confirmado:", order.order_nsu);
    return reply(200, "ok");
  }

  order.status = check.amount === order.total ? "pago" : "valor divergente";
  order.paidAt = new Date().toISOString();
  order.paidAmount = check.paid_amount;
  order.installments = check.installments;
  order.method = check.capture_method;
  order.receiptUrl = typeof b.receipt_url === "string" ? b.receipt_url : "";
  order.transactionNsu = b.transaction_nsu;
  await store.setJSON(order.order_nsu, order);
  return reply(200, "ok");
};
