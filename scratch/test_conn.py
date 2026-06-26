import requests

hosts = [
    "http://deals.flipshope.com:6333",
    "https://deals.flipshope.com/qdrant",
    "https://deals.flipshope.com/sim_project/qdrant",
]
headers = {
    "api-key": "H7kP2sM8Lx9QeA3N5R0CwZ4VYB6D1JtFUpoXiKrmvS"
}

for host in hosts:
    try:
        print(f"Trying {host}...")
        r = requests.get(f"{host}/collections", headers=headers, timeout=5)
        print(f"Status: {r.status_code}, Response: {r.text[:200]}")
    except Exception as e:
        print(f"Failed to connect to {host}: {e}")
