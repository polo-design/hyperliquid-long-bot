import os
from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants

HL_ACCOUNT = os.environ["HL_ACCOUNT"]
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]
WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]

app = FastAPI()

exchange = Exchange(
    base_url=constants.MAINNET_API_URL,
    wallet=HL_ACCOUNT,
    private_key=HL_PRIVATE_KEY
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    symbol = data.get("symbol", "BTC-USDC")
    side = data.get("side", "buy")

    account = exchange.info.user_state(HL_ACCOUNT)
    usdc = float(account["marginSummary"]["accountValue"])
    price = exchange.info.mid_price(symbol)

    size = round((usdc * 0.9) / price, 6)  # 90% kapitału

    if side == "buy":
        exchange.market_open(symbol, True, size)
    elif side == "sell":
        exchange.market_close(symbol)

    return {"ok": True}
