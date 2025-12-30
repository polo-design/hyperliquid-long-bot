import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===============================
// ENV — MUSZĄ ISTNIEĆ NA RENDERZE
// ===============================
const {
  HL_PRIVATE_KEY,   // hex, BEZ 0x
  HL_WALLET,        // 0x...
  HL_API_URL = "https://api.hyperliquid.xyz",
  PORT = 10000
} = process.env;

if (!HL_PRIVATE_KEY || !HL_WALLET) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

// ===============================
// UTILS
// ===============================
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

async function safeFetch(url, body) {
  const payload = JSON.stringify({
    ...body,
    nonce: Date.now()
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet": HL_WALLET,
      "X-Signature": sign(payload)
    },
    body: payload
  });

  const raw = await res.text();

  if (!res.ok) {
    console.error("❌ HL HTTP ERROR:", res.status, raw);
    throw new Error(raw);
  }

  try {
    return JSON.parse(raw);
  } catch {
    console.error("❌ HL NON-JSON RESPONSE:", raw);
    throw new Error("HL returned non-JSON");
  }
}

// ===============================
// HYPERLIQUID
// ===============================
async function getUserState() {
  return safeFetch(`${HL_API_URL}/info`, {
    type: "userState",
    wallet: HL_WALLET
  });
}

async function hasOpenPosition(symbol = "BTC") {
  const state = await getUserState();
  return state.assetPositions?.some(
    p => p.position?.coin === symbol && Math.abs(Number(p.position.szi)) > 0
  );
}

async function openLong(symbol = "BTC") {
  return safeFetch(`${HL_API_URL}/exchange`, {
    type: "order",
    orders: [{
      asset: symbol,
      isBuy: true,
      reduceOnly: false,
      orderType: { market: {} },
      sz: "ALL"
    }]
  });
}

async function closePosition(symbol = "BTC") {
  return safeFetch(`${HL_API_URL}/exchange`, {
    type: "order",
    orders: [{
      asset: symbol,
      isBuy: false,
      reduceOnly: true,
      orderType: { market: {} },
      sz: "ALL"
    }]
  });
}

// ===============================
// WEBHOOK
// ===============================
app.post("/webhook", async (req, res) => {
  const { side } = req.body;
  console.log("📩 WEBHOOK:", side);

  if (side !== "long" && side !== "short") {
    return res.status(422).json({ error: "invalid payload" });
  }

  try {
    if (side === "long") {
      if (await hasOpenPosition()) {
        return res.json({ status: "skipped", reason: "already in position" });
      }
      const r = await openLong();
      return res.json({ status: "long opened", result: r });
    }

    if (side === "short") {
      const r = await closePosition();
      return res.json({ status: "position closed", result: r });
    }

  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: "execution failed" });
  }
});

// ===============================
app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
