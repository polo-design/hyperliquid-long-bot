import os
from fastapi import FastAPI, Request, HTTPException

from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

# =========================
# ENV
# =========================
HL_ACCOUNT = os.environ["HL_ACCOUNT"]
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

# =========================
# HYPERLIQUID CLIENTS
# =========================
info = Info(constants.MAINNET_API_URL)

# ⚠️ UWAGA: argumenty POZYCYJNE (TA WERSJA SDK)
exchange = Exchange(
    HL_ACCOUNT,
    HL_PRIVATE_KEY,
    constants.MAINNET_API_URL,
)

# =========================
# CONFIG
# =========================
SYMBOL = "BTC-USDC"
ORDER_SIZE_USD = 20  # testowo

# =========================
# FASTAPI
# =========================
app = FastAPI()

# =========================
# HELPERS
# =========================
def get_position(symbol: str):
    state = info.user_state(HL_ACCOUNT)
    coin = symbol.replace("-USDC", "")

    for pos in state["assetPositions"]:
        if pos["position"]["coin"] == coin:
            return pos["position"]

    return None

# =========================
# WEBHOOK
# =========================
@app.post("/webhook")
async def webhook(request: Request):
    secret = request.headers.get("x-webhook-secret")
    if secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    data = await request.json()
    action = data.get("action")

    if action not in ("buy", "close"):
        raise HTTPException(status_code=400, detail="Invalid action")

    position = get_position(SYMBOL)

    # ===== OPEN LONG =====
    if action == "buy":
        if position:
            return {"status": "already_open"}

        exchange.market_open(
            name=SYMBOL,
            is_buy=True,
            sz=ORDER_SIZE_USD,
        )

        return {"status": "long_opened"}

    # ===== CLOSE =====
    if action == "close":
        if not position:
            return {"status": "no_position"}

        exchange.market_close(name=SYMBOL)

        return {"status": "position_closed"}
