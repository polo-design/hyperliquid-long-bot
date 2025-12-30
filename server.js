import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const HL_ACCOUNT = process.env.HL_ACCOUNT;

if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

const API_URL = "https://api.hyperliquid.xyz";

function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

async function sendOrder(isBuy) {
  const body = {
    type: "order",
    orders: [
      {
        asset: "BTC-USDC",          // 🔥 WAŻNE
        isBuy,
        reduceOnly: !isBuy,
        orderType: { market: {} },
        sz: 0.001                   // 🔥 TESTOWO MAŁY SIZE
      }
    ]
  };

  body.nonce = Date.now();
  const payload = JSON.stringify(body);

  const res = await fetch(API_URL + "/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": sign(payload),
      "X-Wallet": HL_ACCOUNT
    },
    body: payload
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text);
  }

  return text;
}

app.post("/webhook", async (req, res) => {
  const { side } = req.body;

  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const r = await sendOrder(true);
      return res.json({ status: "sent", side, response: r });
    }

    if (side === "short") {
      const r = await sendOrder(false);
      return res.json({ status: "closed", side, response: r });
    }

    return res.status(400).json({ error: "invalid payload" });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
