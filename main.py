import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants

# =======================
# ENV VARIABLES (Render)
# =======================
HL_ACCOUNT = os.environ["HL_ACCOUNT"]          # 0x...
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]  # private key
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]  # np. HL_BOT_XXXX

# =======================
# CONFIG
# =======================
SYMBOL = "BTC-USDC"
USE_BALANCE_RATIO = 0.90   # <<< 90% kapitału
LEVERAGE = 10              # taka sama jak ustawisz w Hyperliquid UI

# =======================
# INIT
# =======================
app = FastAPI()

info = Info(constants.MAINNET_API_URL)
exchange = Exchange(
    wallet=HL_ACCOUNT,
    base_url=constants.MAINNET_API_URL,
    key=HL_PRIVATE_KEY,
)

# =======================
# HELPERS
# =======================
def get_available_margin() -> float:
    state = info.user_state(HL_ACCOUNT)
    return float(state["marginSummary"]["availableMargin"])

def get_position_size(symbol: str) -> float:
    state = info.user_state(HL_ACCOUNT)
    positions = state.get("assetPositions", [])
    for p in positions:
        if p["position"]["coin"] == symbol.replace("-USDC", ""):
            return abs(float(p["position"]["szi"]))
    return 0.0

# =======================
# WEBHOOK
# =======================
@app.post("/webhook")
async def webhook(request: Request):
    data = await request.json()

    # --- security ---
    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    action = data.get("action")  # "long" albo "close"

    # =======================
    # LONG (OPEN)
    # =======================
    if action == "long":
        available = get_available_margin()
        usd_position = available * USE_BALANCE_RATIO * LEVERAGE

        exchange.market_open(
            name=SYMBOL,
            is_buy=True,
            sz=usd_position,
        )

        return {
            "status": "ok",
            "action": "long",
            "used_usd": usd_position
        }

    # =======================
    # CLOSE (ZAMYKA LONG)
    # =======================
    if action == "close":
        size = get_position_size(SYMBOL)

        if size == 0:
            return {"status": "ok", "message": "no position to close"}

        exchange.market_close(
            name=SYMBOL,
            sz=size
        )

        return {
            "status": "ok",
            "action": "close",
            "closed_size": size
        }

    return {"status": "ignored"}
