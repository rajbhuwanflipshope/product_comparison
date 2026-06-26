import time
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

URL = "http://127.0.0.1:8000/sim_project/search"
NUM_REQUESTS = 500
CONCURRENT = True
MAX_WORKERS = 1

TITLES = [
    "HDROYL Combo of 3 Simple Hijab Nose Piece With Gloves & Socks For Muslim Women Chiffon Abaya(Black)",
    "black rose Beautiful Women New Latest Trending Classy&Decent Pattern Abaya Imported Fabric Georgette Solid, Self Design Abaya With Hijab(Black)",
    "Dhyeyu 2 Layer Hijab Nose Piece With Golden Locket Pendal Chiffon Solid Burqa(Black)",
    "Ayeza Naqab Collection Sharkh A-line style Abaya|Color Black & Beige Crepe Solid Abaya With Hijab(Black, Beige)",
    "TRUERISE Stylish Dubai Black Kaftan& Dupatta for girls & women (52 length) Nida & Polyester Abaya With Hijab(Black)",
    "Crown outfit Women's fancy stone work new design burqa imported nida fabric with hijab Polyester Self Design, Solid Burqa With Hijab(Black)",
    "Shama New Fancy Royal Pink Front Open Nimra Abaya Burqa with Belt Cotton Blend Solid Burqa With Hijab(Pink)",
    "Dhyeyu New Grey Embroidery Work Princess EP_01 Hijab Nose Piece For Muslim Women Chiffon Solid Abaya(Black)",
    "recent tdrends Abaya for women beautiful Umbrella stylesh abaya with embroidered fir girl Crepe Abaya With Hijab(Green)",
    "Dhyeyu Excellent Finishing Diamond Work Noase Piece Chiffon Self Design Naqab(Black)"
]

def send_request(index, title):
    payload = {
        "job_id": f"test_job_{index}",
        "title": title
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        URL, 
        data=data, 
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    start_time = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            body = response.read().decode('utf-8')
            latency = time.perf_counter() - start_time
            return {
                "index": index,
                "success": True,
                "latency": latency
            }
    except Exception as e:
        latency = time.perf_counter() - start_time
        return {
            "index": index,
            "success": False,
            "latency": latency,
            "error": str(e)
        }

def run_benchmark():
    actual_titles = [TITLES[i % len(TITLES)] for i in range(NUM_REQUESTS)]
    print(f"Starting local benchmark against {URL} with {MAX_WORKERS} workers...")
    
    results = []
    start_total = time.perf_counter()
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(send_request, i, title) for i, title in enumerate(actual_titles)]
        for future in as_completed(futures):
            res = future.result()
            results.append(res)
            print("." if res["success"] else "X", end="", flush=True)
    print()
    
    total_time = time.perf_counter() - start_total
    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]
    latencies = [r["latency"] for r in results]
    
    print("\n" + "=" * 60)
    print("LOCAL BENCHMARK SUMMARY STATISTICS")
    print("=" * 60)
    print(f"Total Time Taken:  {total_time:.4f} seconds")
    print(f"Requests / Sec:    {NUM_REQUESTS / total_time:.2f}")
    print(f"Success Rate:      {len(successes)} / {NUM_REQUESTS} ({len(successes)/NUM_REQUESTS*100:.1f}%)")
    if failures:
        print(f"First 5 Errors: {[f['error'] for f in failures[:5]]}")
    print("=" * 60)

if __name__ == "__main__":
    run_benchmark()
