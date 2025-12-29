from fastapi import FastAPI, Request, HTTPException
import os

app = FastAPI()

# =========================
# BASIC ENDPOINTS
# =========================

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "trading-bot",
        "env_loaded": {
            "HL_ACCOUNT": bool(os.getenv("HL_ACCOUNT")),
            "HL_PRIVATE_KEY": bool(os.getenv("HL_PRIVATE_KEY")),
        }
    }


@app.get("/health")
def health():
    return {"health": "green"}


# =========================
# WEBHOOK ENDPOINT
# =========================

@app.post("/webhook")
async def webhook(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # TU NA RAZIE TYLKO LOGIKA TESTOWA
    print("WEBHOOK RECEIVED:")
    print(payload)

    return {
        "status": "received",
        "payload": payload
    }
