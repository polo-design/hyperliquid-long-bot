import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants

# =======================
# ENV
# =======================
HL_ACCOUNT = os.environ["HL_ACCOUNT"]          # 0x...
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]  # PRIVATE KEY
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

# =======================
# CONFIG
# =======================
SYMBOL = "BTC"
USE_BALANCE_RATIO = 0.90
LEVERAGE = 10

# =======================
# INIT
# =======================
app = FastAPI()

info = Info(constants.MAINNET_API_URL)

# 🔴 TU JEST KLUCZOWA KOLEJNOŚĆ
exchange = Exchange(
    HL_ACCOUNT,
    HL_PRIVATE_KEY,
    constants.MAINNET_API_URL
)

# =======================
# HELPERS
# =======================
def available_margin():
    state = info.user_state(HL_ACCOUNT)
    return float(state["marginSummary"]["availableMargin"])

def position_size():
    state = info.user_state(HL_ACCOUNT)
    for p in state.get("assetPositions", []):
        if p["position"]["coin"] == SYMBOL:
            return abs(float(p["position"]["szi"]))
    return 0.0

# =======================
# WEBHOOK
# =======================
@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403)

    action = data.get("action")

    # ---- LONG ----
    if action == "long":
        margin = available_margin()
        usd_size = margin * USE_BALANCE_RATIO * LEVERAGE

        exchange.market_open(
            name=SYMBOL,
            is_buy=True,
            sz=usd_size
        )

        return {"status": "long", "usd": usd_size}

    # ---- CLOSE ----
    if action == "close":
        size = position_size()
        if size == 0:
            return {"status": "no_position"}

        exchange.market_close(
            name=SYMBOL,
            sz=size
        )

        return {"status": "closed", "size": size}

    return {"status": "ignored"}
