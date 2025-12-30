import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // BEZ 0x

if (!ACCOUNT || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

const BASE = "https://api.hyperliquid.xyz";

/* ================= SIGN ================= */
function sign(body) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(JSON.stringify(body))
    .digest("hex");
}

/* ================= FETCH ================= */
async function hlFetch(endpoint, body) {
  const sig = sign(body);

  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HL-ACCOUNT": ACCOUNT,
      "HL-SIGNATURE": sig,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* ================= HELPERS ================= */
async function getBalance() {
  const res = await hlFetch("/info", { type: "accountState" });
  return Number(res.availableBalance);
}

async function getPrice() {
  const res = await hlFetch("/info", { type: "markPrice", coin: "BTC" });
  return Number(res.markPx);
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (side !== "long") {
      return res.status(422).json({ error: "invalid payload" });
    }

    const usdc = await getBalance();
    if (usdc <= 1) throw new Error("Balance too low");

    const price = await getPrice();
    const size = Number((usdc / price).toFixed(4));

    const order = {
      type: "order",
      orders: [
        {
          coin: "BTC",
          isBuy: true,
          sz: size,
          limitPx: price,
          reduceOnly: false,
        },
      ],
    };

    const result = await hlFetch("/exchange", order);
    console.log("🚀 ORDER SENT:", result);

    res.json({ status: "ok", size });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    res.status(500).json({ error: "execution failed", msg: e.message });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
