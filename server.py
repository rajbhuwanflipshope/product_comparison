from flask import Flask, request, jsonify
from flask_cors import CORS
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from pymongo import MongoClient
import re
import match  # Import our existing matching logic

app = Flask(__name__)
CORS(app)  # Allow Chrome Extension to hit this API

# Source MongoDB (Read-only)
src_client = MongoClient("mongodb://read_only:v%3F8lT%21sw%26pu4ec2zaPra@143.110.184.59:27017/?authMechanism=DEFAULT")
src_db = src_client["fs_graph"]
src_col = src_db["price_graph"]

LOCAL_PROCESSED_PIDS = set()
LOCAL_PRODUCT_BATCH = []
GLOBAL_SKIP_OFFSET = -1


@app.route('/get-next-product', methods=['GET'])
def get_next_product():
    global LOCAL_PRODUCT_BATCH, GLOBAL_SKIP_OFFSET
    try:
        # Initialize offset dynamically on first request
        if GLOBAL_SKIP_OFFSET == -1:
            try:
                completed_count = src_db["price_comparison"].count_documents({})
                GLOBAL_SKIP_OFFSET = max(0, (completed_count // 500) * 500)
                print(f"[SERVER] Dynamic offset initialized to {GLOBAL_SKIP_OFFSET} based on {completed_count} completed documents in price_comparison.")
            except Exception as e:
                GLOBAL_SKIP_OFFSET = 500
                print(f"[SERVER] Error initializing dynamic offset: {e}. Defaulting to 500.")

        # Get list of already processed pids from DB using read_only connection
        processed_pids = set()
        try:
            pids = src_db["price_comparison"].distinct("priceComparisonMap.pid")
            processed_pids.update(pids)
            print(f"[SERVER] Retrieved {len(pids)} already completed PIDs from 'price_comparison' to exclude them.")
        except Exception as e:
            print(f"[SERVER] Error reading price_comparison: {e}")
            
        all_processed = processed_pids.union(LOCAL_PROCESSED_PIDS)

        # Loop until we find a valid unprocessed product
        while True:
            # If batch is empty, fetch next 100
            if not LOCAL_PRODUCT_BATCH:
                print(f"[SERVER] Fetching next batch of 100 unprocessed products from 'price_graph' (Skip Offset: {GLOBAL_SKIP_OFFSET})...")
                filtered = []
                
                # Fetch in chunks of 500 and filter in Python to avoid MongoDB $nin scan hangs
                while len(filtered) < 100:
                    query = {
                        "category": 13,
                        "sub_cat_id": 1302
                    }
                    db_products = list(src_col.find(query).skip(GLOBAL_SKIP_OFFSET).limit(500))
                    if not db_products:
                        break
                    
                    batch_filtered = [p for p in db_products if p.get("pid") not in all_processed]
                    filtered.extend(batch_filtered)
                    GLOBAL_SKIP_OFFSET += 500
                    
                if not filtered:
                    print("[SERVER] No more unprocessed products found in DB.")
                    return jsonify({"status": "empty", "message": "No unprocessed products found."}), 404
                    
                LOCAL_PRODUCT_BATCH = filtered[:100]
                print(f"[SERVER] Loaded {len(LOCAL_PRODUCT_BATCH)} products from 'price_graph' into memory batch.")

             # Pop the first product
            product = LOCAL_PRODUCT_BATCH.pop(0)
            pid = product.get("pid")
            
            print(f"[DEBUG] Popped product pid: '{pid}' (type={type(pid)}), is in all_processed: {pid in all_processed}")
            print(f"[DEBUG] LOCAL_PROCESSED_PIDS: {list(LOCAL_PROCESSED_PIDS)[:10]}")
            
            # If it was processed in the meantime, skip it
            if pid in all_processed:
                print(f"[DEBUG] Skipping processed pid: {pid}")
                continue
                
            # Find query title
            title = None
            for field in ["title", "name", "product_name", "query"]:
                if product.get(field):
                    title = product.get(field)
                    break
                    
            return jsonify({
                "status": "success",
                "sid": product.get("sid"),
                "pid": pid,
                "title": title or "Unknown Product"
            })
    except Exception as e:
        print(f"[SERVER] Error in get_next_product: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/mark-skipped', methods=['POST'])
def mark_skipped():
    try:
        data = request.json
        if not data or 'pid' not in data:
            return jsonify({"error": "Missing 'pid'"}), 400
        
        pid = data['pid']
        # Store in local memory cache so it is skipped during this session
        LOCAL_PROCESSED_PIDS.add(pid)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/extract-details', methods=['POST'])
def extract_details_api():
    data = request.json
    if not data or 'query' not in data:
        return jsonify({"error": "Missing 'query' in request body"}), 400
    details = match.extract_details(data['query'])
    return jsonify(details)


@app.route('/search', methods=['POST'])
def search():
    data = request.json
    if not data or 'query' not in data:
        return jsonify({"error": "Missing 'query' in request body"}), 400
        
    raw_query = data['query']
    print(f"\n[SERVER] Received query from extension: {raw_query}")
    
    # 1. Use the NLP extractor from match.py
    details = match.extract_details(raw_query)
    
    # Construct a clean, targeted search query
    search_parts = []
    if details.get('brand'):
        search_parts.append(details['brand'])
    if details.get('model'):
        search_parts.append(details['model'])
    if details.get('storage'):
        search_parts.append(details['storage'])
    
    clean_query = " ".join(search_parts).strip()
    if not clean_query:
        clean_query = raw_query
        
    print(f"[SERVER] Extracted Details: {details}")
    print(f"[SERVER] Searching for clean query: {clean_query}")

    # 3. Spin up stealth Selenium
    options = Options()
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': 'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
    })

    # 4. Search across platforms
    results = {
        "amazon": match.search_amazon(driver, clean_query, details),
        "flipkart": match.search_flipkart(driver, clean_query, details),
        "croma": match.search_croma(driver, clean_query, details),
        "reliance_digital": match.search_reliance(driver, clean_query, details)
    }

    driver.quit()

    output = {
        "input_product": details,
        "results": results
    }
    
    print("[SERVER] Finished searching! Sending results to extension.")
    return jsonify(output)

if __name__ == '__main__':
    print("Starting Product Matching Server on http://localhost:5000...")
    app.run(port=5000, debug=True)
