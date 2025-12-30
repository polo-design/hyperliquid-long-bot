import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* ======================
   CONFIG
====================== */
const PORT = process.env.PORT || 10000;
const HL_API = "https://api.hyperliquid.xyz";

const PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // hex, BEZ 0x
const WALLET = process.env.HL_WALLET;            // 0x...

if (!PRIVATE_KEY || !WALLET) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

/* ======================
   HELPERS
====================== */
function sign(body) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(JSON.stringify(body))
    .digest("hex");
}

async function post(endpoint, body) {
  body.nonce = Date.now();

  const res = await fetch(HL_API + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": sign(body),
      "X-Wallet": WALLET,
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

/* ======================
   BALANCE + PRICE
====================== */
async function getAccountValue() {
  const r = await fetch(HL_API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "userState",
      user: WALLET,
    }),
  });

  const text = await r.text();
  const json = JSON.parse(text);

  return Number(json.marginSummary.accountValue); // USDC
}

async function getBTCPrice() {
  const r = await fetch(HL_API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" }),
  });

  const text = await r.text();
  const json = JSON.parse(text);

  return Number(json["BTC-USDC"]);
}

/* ======================
   ORDERS
====================== */
async function openLong100() {
  const balance = await getAccountValue(); // np. 20
  const price = await getBTCPrice();       // np. 43000

  // 95% żeby NIE wywaliło margin
  const notional = balance * 0.95;
  const size = Number((notional / price).toFixed(6));

  console.log(`🟢 LONG 100% | balance=${balance} size=${size}`);

  return post("/exchange", {
    type: "order",
    orders: [
      {
        asset: "BTC-USDC",
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: size,
      },
    ],
  });
}

async function closeAll() {
  console.log("🔴 CLOSE 100%");

  return post("/exchange", {
    type: "order",
    orders: [
      {
        asset: "BTC-USDC",
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
  });
}

/* ======================
   WEBHOOK
====================== */
app.post("/webhook", async (req, res) => {
  const { side } = req.body;
  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const r = await openLong100();
      return res.json({ status: "sent", side, r });
    }

    if (side === "short") {
      const r = await closeAll();
      return res.json({ status: "sent", side, r });
    }

    return res.status(400).json({ error: "invalid payload" });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

/* ======================
   HEALTH
====================== */
app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
