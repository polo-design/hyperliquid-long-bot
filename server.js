import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// =====================
// ENV (USTAW NA RENDERZE)
// =====================
const HL_API = "https://api.hyperliquid.xyz";
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // hex, BEZ 0x
const HL_ACCOUNT = process.env.HL_ACCOUNT;         // 0x...
const TRADE_PERCENT = 0.9;                          // 90%
const SYMBOL = "BTC";

// =====================
// WALIDACJA ENV
// =====================
if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

// =====================
// HELPERS
// =====================
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

async function hlPost(endpoint, body) {
  body.nonce = Date.now();
  const payload = JSON.stringify(body);

  const res = await fetch(HL_API + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": sign(payload),
      "X-Wallet": HL_ACCOUNT,
    },
    body: payload,
  });

  const text = await res.text();

  // ⛔ Hyperliquid czasem zwraca PLAIN TEXT
  if (!text.startsWith("{")) {
    throw new Error(text);
  }

  return JSON.parse(text);
}

// =====================
// CHECK: CZY JEST POZYCJA
// =====================
async function hasOpenPosition() {
  const res = await fetch(HL_API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "userState",
      user: HL_ACCOUNT,
    }),
  });

  const data = await res.json();
  return data.assetPositions?.some(
    (p) => p.position.coin === SYMBOL && p.position.szi !== "0"
  );
}

// =====================
// BALANCE
// =====================
async function getAccountValue() {
  const res = await fetch(HL_API + "/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "userState",
      user: HL_ACCOUNT,
    }),
  });

  const data = await res.json();
  return Number(data.marginSummary.accountValue);
}

// =====================
// ORDERS
// =====================
async function openLong() {
  if (await hasOpenPosition()) {
    return { skipped: true, reason: "position already open" };
  }

  const balance = await getAccountValue();
  const notional = balance * TRADE_PERCENT;

  return hlPost("/exchange", {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: notional,
      },
    ],
  });
}

async function closePosition() {
  return hlPost("/exchange", {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
  });
}

// =====================
// WEBHOOK
// =====================
app.post("/webhook", async (req, res) => {
  const { side } = req.body;
  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const result = await openLong();
      return res.json({ status: "ok", side, result });
    }

    if (side === "short") {
      const result = await closePosition();
      return res.json({ status: "ok", side, result });
    }

    return res.status(422).json({ error: "invalid payload" });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

// =====================
app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("🚀 BOT LIVE on 10000");
});
