// Razorpay order creation for Traya Utsav Chapter 2.0
// Runs as a Vercel serverless function at /api/create-order
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   RAZORPAY_KEY_ID     — live Key ID (rzp_live_...)
//   RAZORPAY_KEY_SECRET — live Key Secret (never expose client-side)

const PRICES = { single: 249, twoday: 480, group: 849 };

const STATIC_ALLOWED_ORIGINS = [
  "https://meerkatsai.github.io",
  "https://traya-utsav-tickets.vercel.app",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true; // local preview
  // Vercel preview deployments of this project
  if (/^https:\/\/traya-utsav-tickets[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", isAllowedOrigin(origin) ? origin : STATIC_ALLOWED_ORIGINS[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: "Payment gateway not configured on the server" });
  }

  const { qty = {}, customer = {}, dates = {} } = req.body || {};

  // Recompute the amount server-side — never trust a client-sent total.
  let total = 0;
  const cleanQty = {};
  for (const k of Object.keys(PRICES)) {
    const n = Math.max(0, Math.min(20, parseInt(qty[k], 10) || 0));
    cleanQty[k] = n;
    total += PRICES[k] * n;
  }
  if (total <= 0) return res.status(400).json({ error: "No tickets selected" });

  const notes = {
    event: "Traya Utsav Chapter 2.0",
    tickets: JSON.stringify(cleanQty),
    singleDayDate: String(dates.single || "").slice(0, 20),
    groupDate: String(dates.group || "").slice(0, 20),
    name: String(customer.name || "").slice(0, 100),
    email: String(customer.email || "").slice(0, 100),
    phone: String(customer.phone || "").slice(0, 20),
  };

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let rp, data;
  try {
    rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: total * 100, // paise
        currency: "INR",
        receipt: `utsav-${Date.now()}`,
        notes,
      }),
    });
    data = await rp.json();
  } catch (err) {
    console.error("Razorpay request failed", err);
    return res.status(502).json({ error: "Could not reach payment gateway" });
  }

  if (!rp.ok || !data.id) {
    console.error("Razorpay order creation failed", data);
    return res.status(502).json({ error: "Could not create payment order" });
  }

  return res.status(200).json({
    orderId: data.id,
    amount: total * 100,
    currency: "INR",
    keyId,
  });
};
