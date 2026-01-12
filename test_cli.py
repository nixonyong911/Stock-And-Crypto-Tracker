import requests
import time

start = time.time()
try:
    r = requests.post(
        'http://localhost:8080/cli/telegram-agent/cursor/sonnet-4.5',  # ai-hub2 container 
        json={'message': 'bullish stocks jan 8 2026'}, 
        headers={'X-API-Key': '5b2599a5-b77c-415f-bdd3-8fe9faf5d499'}, 
        timeout=120
    )
    print(f'Time: {time.time()-start:.1f}s')
    print(f'Status: {r.status_code}')
    print(f'Response: {r.text[:800]}')
except Exception as e:
    print(f'Error after {time.time()-start:.1f}s: {e}')
