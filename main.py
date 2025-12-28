from fastapi import FastAPI, Request, HTTPException
from hyperliquid.exchange import Exchange
import os

app = FastAPI()

HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")
HL_ADDRESS = os.getenv("HL_ADDRESS")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

exchange = Exchange(HL_PRIVATE_KEY, address=HL_ADDRESS)

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    if data.get("secret") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    signal = data.get("signal")
    symbol = "BTC"

    position = exchange.get_position(symbol)

    # LONG ONLY
    if signal == "Go Long":
        if position is None:
            exchange.market_open(symbol, True, 0.01)

    # EXIT LONG
    if signal == "Go Short":
        if position is not None:
            exchange.market_close(symbol)

    return {"status": "ok"}
