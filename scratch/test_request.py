import urllib.request
import json
import time

URL = "https://deals.flipshope.com/sim_project/search"
payload = {
    "job_id": "test_job_1",
    "title": "HDROYL Combo of 3 Simple Hijab Nose Piece With Gloves & Socks For Muslim Women Chiffon Abaya(Black)"
}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(
    URL, 
    data=data, 
    headers={'Content-Type': 'application/json'},
    method='POST'
)

start_time = time.time()
try:
    with urllib.request.urlopen(req, timeout=35) as response:
        print(f"Status: {response.status}")
        print(response.read().decode('utf-8'))
except Exception as e:
    print(f"Failed in {time.time() - start_time:.2f}s: {e}")
    if hasattr(e, 'read'):
        print("Body:", e.read().decode('utf-8'))
