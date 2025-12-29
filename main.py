import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

HL_ACCOUNT = os.environ["HL_ACCOUNT"]
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

SYMBOL = "BTC-USDC"
CAPITAL_PCT = 0.90

app = FastAPI()

# 🔥 WŁAŚCIWA KOLEJNOŚĆ ARGUMENTÓW
exchange = Exchange(
    HL_ACCOUNT,
    HL_PRIVATE_KEY,
    constants.MAINNET_API_URL
)

info = Info(constants.MAINNET_API_URL)

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    action = data.get("action")

    state = info.user_state(HL_ACCOUNT)
    available = float(state["marginSummary"]["availableMargin"])
    usd_size = available * CAPITAL_PCT

    if action == "buy":
        exchange.order(
            name=SYMBOL,
            is_buy=True,
            sz=usd_size,
            limit_px=None,
            order_type="market"
        )
        return {"status": "LONG opened", "usd": usd_size}

    if action == "close":
        exchange.close_position(SYMBOL)
        return {"status": "Position closed"}

    raise HTTPException(status_code=400, detail="Unknown action")
