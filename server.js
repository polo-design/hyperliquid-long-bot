// ================================
// Hyperliquid REAL BOT – FINAL
// ENV REQUIRED:
// HL_PRIVATE_KEY
// HL_ACCOUNT
// PORT
// ================================

import crypto from "crypto";
import express from "express";

const {
  HL_PRIVATE_KEY,
  HL_ACCOUNT,
  PORT = 10000,
} = process.env;

// ===== HARD FAIL IF ENV WRONG =====
if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (!HL_PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

// ===== CONSTANTS =====
const BASE_URL = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC-USDC";
const ASSET_ID = 0; // BTC = 0 on Hyperliquid

// ===== HELPERS =====
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY.slice(2), "hex"))
    .update(msg)
    .digest("hex");
}

async function hlFetch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text);
  }

  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }

  return json;
}

// ===== GET MARK PRICE =====
async function getMarkPrice() {
  const res = await hlFetch("/info", {
    type: "allMids",
  });

  const price = Number(res.mids[SYMBOL]);
  if (!price) throw new Error("No mark price");

  return price;
}

// ===== GET ACCOUNT BALANCE =====
async function getUsdcBalance() {
  const res = await hlFetch("/info", {
    type: "clearinghouseState",
    user: HL_ACCOUNT,
  });

  const usdc = Number(res.marginSummary.accountValue);
  if (!usdc || usdc <= 0) throw new Error("No balance");

  return usdc;
}

// ===== PLACE REAL ORDER =====
async function placeOrder(side) {
  const isBuy = side === "long";

  const price = await getMarkPrice();
  const balance = await getUsdcBalance();

  // use 100% balance
  const size = +(balance / price).toFixed(4);

  const action = {
    type: "order",
    orders: [
      {
        a: ASSET_ID,
        b: isBuy,
        p: price,
        s: size,
        r: false,
        t: "market",
      },
    ],
  };

  const payload = {
    action,
    nonce: Date.now(),
    account: HL_ACCOUNT,
  };

  const signature = signPayload(payload);

  console.log("📦 PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const result = await hlFetch("/exchange", {
    payload,
    signature,
  });

  return result;
}

// ===== EXPRESS =====
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("🚀 REAL ORDER:", side);

    const result = await placeOrder(side);

    console.log("✅ ORDER RESULT:", result);

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({
      error: "execution failed",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
