// server.js
import http from "http";
import crypto from "crypto";

// ================== CONFIG ==================
const PORT = process.env.PORT || 10000;

// UŻYWAMY DOKŁADNIE TYCH NAZW
const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

// ================== STARTUP CHECK ==================
console.log("🔍 STARTING BOT...");
console.log("🔍 ENV CHECK:");

if (!ACCOUNT || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  console.error("ACCOUNT:", ACCOUNT);
  console.error("PRIVATE_KEY:", PRIVATE_KEY ? "OK" : "MISSING");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

// sanity check private key
if (!/^[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
  console.error("❌ PRIVATE_KEY must be 64 hex chars, WITHOUT 0x");
  process.exit(1);
}

console.log("🔑 PRIVATE KEY FORMAT OK");

// ================== HELPERS ==================
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(JSON.stringify(payload))
    .digest("hex");
}

// ================== HYPERLIQUID CALL (DEBUG MODE) ==================
async function placeOrder(side) {
  console.log("🧠 placeOrder() called");
  console.log("➡️ SIDE:", side);

  // 👉 TU NORMALNIE IDZIE PRAWDZIWE API HL
  // Na razie robimy DEBUG SAFE MODE,
  // żebyś WIDZIAŁ że flow działa do końca

  const payload = {
    account: ACCOUNT,
    symbol: "BTC-USDC",
    side,
    sizeMode: "ALL", // 100% salda
    timestamp: Date.now(),
  };

  const signature = sign(payload);

  console.log("📦 PAYLOAD:", payload);
  console.log("✍️ SIGNATURE:", signature);

  // TU BĘDZIE fetch do Hyperliquid
  // (na razie tylko symulacja sukcesu)
  return {
    ok: true,
    simulated: true,
    payload,
  };
}

// ================== HTTP SERVER ==================
const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    console.log("📩 WEBHOOK RECEIVED");

    try {
      const raw = await readBody(req);
      console.log("📨 RAW BODY:", raw);

      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        console.error("❌ INVALID JSON");
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "invalid json" }));
      }

      const { side } = json;
      if (!side || !["long", "short"].includes(side)) {
        console.error("❌ INVALID PAYLOAD", json);
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "invalid payload" }));
      }

      const result = await placeOrder(side);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      console.error("❌ EXECUTION ERROR:", err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "execution failed" }));
    }
    return;
  }

  // healthcheck
  res.writeHead(200);
  res.end("OK");
});

server.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
