import time
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
URL = "https://deals.flipshope.com/sim_project/search"
NUM_REQUESTS = 200
CONCURRENT = True
MAX_WORKERS = 1 # Number of concurrent workers (threads)

# Default fallback titles (mix of search titles)
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
            
            # Try parsing the JSON response
            try:
                response_json = json.loads(body)
                similar_products = response_json.get("similar_products", [])
            except Exception:
                similar_products = f"Invalid JSON: {body[:100]}"
                
            return {
                "index": index,
                "title": title,
                "success": True,
                "status": status,
                "latency": latency,
                "output": similar_products,
                "error": None
            }
    except urllib.error.HTTPError as e:
        latency = time.perf_counter() - start_time
        err_body = ""
        try:
            err_body = e.read().decode('utf-8')
        except Exception:
            pass
        return {
            "index": index,
            "title": title,
            "success": False,
            "status": e.code,
            "latency": latency,
            "output": None,
            "error": f"HTTP {e.code}: {e.reason} | Body: {err_body}"
        }
    except Exception as e:
        latency = time.perf_counter() - start_time
        return {
            "index": index,
            "title": title,
            "success": False,
            "status": 0,
            "latency": latency,
            "output": None,
            "error": str(e)
        }

def run_benchmark():
    # Make sure we only request as many as we have if we want unique ones, or cycle them
    actual_titles = []
    for i in range(NUM_REQUESTS):
        actual_titles.append(TITLES[i % len(TITLES)])
        
    print("=" * 60)
    print(f"Starting Search API Benchmark")
    print(f"Target URL: {URL}")
    print(f"Total Requests: {NUM_REQUESTS}")
    print(f"Unique Titles in pool: {len(TITLES)}")
    print(f"Mode: {'Concurrent (Workers: ' + str(MAX_WORKERS) + ')' if CONCURRENT else 'Sequential'}")
    print("=" * 60)
    
    results = []
    start_total = time.perf_counter()
    
    if CONCURRENT:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for i, title in enumerate(actual_titles):
                futures.append(executor.submit(send_request, i, title))
            
            for future in as_completed(futures):
                res = future.result()
                results.append(res)
                # Print progress dot
                status_char = "." if res["success"] else "X"
                print(status_char, end="", flush=True)
        print()
    else:
        for i, title in enumerate(actual_titles):
            res = send_request(i, title)
            results.append(res)
            status_char = "." if res["success"] else "X"
            print(status_char, end="", flush=True)
        print()
        
    total_time = time.perf_counter() - start_total
    
    # Sort results by request index so they print in order
    results.sort(key=lambda x: x["index"])
    
    # Print the query outputs
    print("\n" + "=" * 60)
    print("DETAILED REQUEST OUTPUTS & LATENCIES")
    print("=" * 60)
    for res in results:
        status_str = "SUCCESS" if res["success"] else "FAILED"
        print(f"[{res['index']+1:02d}] Title: '{res['title']}'")
        print(f"     Status:  {status_str} (Latency: {res['latency']:.4f}s)")
        if res["success"]:
            print(f"     Results: {json.dumps(res['output'])}")
        else:
            print(f"     Error:   {res['error']}")
        print("-" * 60)
        
    # Calculate stats
    successes = [r for r in results if r["success"]]
    failures = [r for r in results if not r["success"]]
    latencies = [r["latency"] for r in results]
    
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    min_latency = min(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0
    
    # Sort for percentiles
    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)] if latencies else 0
    p90 = latencies[int(len(latencies) * 0.90)] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    
    print("\n" + "=" * 60)
    print("BENCHMARK SUMMARY STATISTICS")
    print("=" * 60)
    print(f"Total Time Taken:  {total_time:.4f} seconds")
    print(f"Requests / Sec:    {NUM_REQUESTS / total_time:.2f}")
    print(f"Success Rate:      {len(successes)} / {NUM_REQUESTS} ({len(successes)/NUM_REQUESTS*100:.1f}%)")
    print(f"Failure Rate:      {len(failures)} / {NUM_REQUESTS} ({len(failures)/NUM_REQUESTS*100:.1f}%)")
    print("-" * 60)
    print("Latency Statistics:")
    print(f"  Min Latency:     {min_latency:.4f}s")
    print(f"  Average Latency: {avg_latency:.4f}s")
    print(f"  Max Latency:     {max_latency:.4f}s")
    print(f"  P50 (Median):    {p50:.4f}s")
    print(f"  P90 Percentile:  {p90:.4f}s")
    print(f"  P95 Percentile:  {p95:.4f}s")
    print("=" * 60)

if __name__ == "__main__":
    run_benchmark()
