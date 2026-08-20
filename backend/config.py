import os

from dotenv import load_dotenv

load_dotenv()

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI", "http://localhost:8000/callback")

UPSTOX_AUTH_URL = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"
UPSTOX_QUOTES_URL = "https://api.upstox.com/v2/market-quote/quotes"
UPSTOX_HISTORICAL_CANDLE_URL = "https://api.upstox.com/v2/historical-candle"

NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
BSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz"

TOKEN_FILE = "token.json"
INSTRUMENT_MAP_FILE = "instrument_map.json"
ALL_INSTRUMENTS_FILE = "all_instruments.json"
HISTORY_CACHE_FILE = "history_cache.json"

# One superset series per instrument (HISTORY_YEARS_BACK of daily candles) —
# the /history endpoint slices 1M/6M/YTD/5Y out of this same series rather
# than making a separate upstream call per range.
HISTORY_CANDLE_INTERVAL = "day"
HISTORY_YEARS_BACK = 5

# Free tier allows 50 req/min; polling once per tick covers the whole
# watchlist (one call, both exchanges) so this stays well under that.
POLL_INTERVAL_SECONDS = 3

# Arbitrage spread: (nse_price - bse_price) / bse_price * 100

# NSE trading symbols. Verified against live NIFTY 50 constituents
# (fetched 2026-08-18). Instrument keys (Upstox instrument_key per
# symbol) are resolved separately from the instruments master file and
# are not hardcoded here since they can change.
# NOTE: index rebalances periodically (typically March/September) — recheck
# before relying on this for anything beyond a prototype.
NIFTY_50_SYMBOLS = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
    "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL",
    "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HINDALCO",
    "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC",
    "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT", "M&M",
    "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SHRIRAMFIN", "SBIN",
    "SUNPHARMA", "TCS", "TATACONSUM", "TMPV", "TATASTEEL",
    "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
]

EXTRA_SYMBOLS = [
    "MAHABANK","IDFCFIRSTB","UJJIVANSFB",
    "AUBANK","INDUSINDBK","FEDERALBNK","BANKBARODA", "PNB","CANBK",
    "UNIONBANK","BANDHANBNK","RBLBANK","YESBANK","IDBI",
    "LICHSGFIN","CHOLAFIN","MUTHOOTFIN",
    "MANAPPURAM","PFC", "RECLTD","LTM","MPHASIS",
    "COFORGE","PERSISTENT","OFSS","KPITTECH",

    "CYIENT","TATAELXSI","TATATECH","MINDTREE",
    "DMART","DABUR","GODREJCP","MARICO","COLPAL",
    "BERGEPAINT","JUBLFOOD","UNITDSPR",
    "VBL","NYKAA",    "SIEMENS",
    "ABB","CUMMINSIND","BHEL","HAL","BEL","BEML",
    "RVNL","IRFC","IRCON","ADANIGREEN",
    "ADANIPOWER","TATAPOWER","TORNTPOWER",
    "NHPC","SJVN","GAIL","IOC","BPCL",
    "HINDPETRO","DIVISLAB","TORNTPHARM",
    "ZYDUSLIFE","LUPIN","AUROPHARMA",
    "BIOCON","ALKEM",
    "IPCALAB","LAURUSLABS","GLAND",
]

WATCHLIST_SYMBOLS = sorted(set(NIFTY_50_SYMBOLS) | set(EXTRA_SYMBOLS))
