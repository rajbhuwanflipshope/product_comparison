import urllib.request
import json

try:
    url = "http://127.0.0.1:8001/sim_project/diagnose"
    with urllib.request.urlopen(url) as response:
        print("Status:", response.status)
        print(json.dumps(json.loads(response.read().decode('utf-8')), indent=2))
except Exception as e:
    print("Local diagnostics failed:", e)
