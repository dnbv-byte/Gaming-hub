// Confirma com a InfinitePay se o pagamento realmente foi feito.
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const handle = process.env.INFINITEPAY_HANDLE;
  const q = event.queryStringParameters || {};
  if (!handle || !q.order_nsu || !q.transaction_nsu || !q.slug)
    return json(400, { paid: false });

  try {
    const res = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        order_nsu: q.order_nsu,
        transaction_nsu: q.transaction_nsu,
        slug: q.slug,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return json(200, { paid: res.ok && data.paid === true });
  } catch (err) {
    console.error("Falha ao verificar pagamento:", err);
    return json(200, { paid: false });
  }
};
