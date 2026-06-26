import uuid
import sys
import time
from datetime import datetime

from pymongo import MongoClient
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import os

# Force UTF-8 output on Windows terminals
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()

# ---------------------------------------------------
# CONFIG  -- update MONGO_URI and QDRANT_URL in .env
# ---------------------------------------------------

MONGO_URI        = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB         = "fs_graph"
MONGO_COLLECTION = "price_graph"
MONGO_FILTER     = {"category": 3}

QDRANT_URL       = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_API_KEY   = os.getenv("QDRANT_API")
COLLECTION_NAME  = "clothing_products"

FIELD_ID         = "_id"
FIELD_TITLE      = "title"
FIELD_LP_TIME    = "lp_time"

BATCH_SIZE       = 500
MODEL_NAME       = "sentence-transformers/paraphrase-MiniLM-L3-v2"
MAX_SEQ_LENGTH   = 128

# ---------------------------------------------------
# HELPERS
# ---------------------------------------------------

def make_point_id(mongo_id):
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, mongo_id))


def parse_lp_time(lp_time):
    if isinstance(lp_time, datetime):
        return int(lp_time.timestamp())
    if isinstance(lp_time, (int, float)):
        return int(lp_time)
    if isinstance(lp_time, str):
        if lp_time.endswith("Z"):
            lp_time = lp_time.replace("Z", "+00:00")
        try:
            return int(datetime.fromisoformat(lp_time).timestamp())
        except Exception:
            pass
    return int(datetime.utcnow().timestamp())


# ---------------------------------------------------
# BATCH PROCESSOR
# ---------------------------------------------------

def process_batch(batch_num, batch, model, qdrant):
    print(f"  Batch #{batch_num:04d} -- encoding {len(batch)} titles...", end="", flush=True)
    try:
        titles  = [item[1] for item in batch]
        vectors = model.encode(
            titles,
            normalize_embeddings=True,
            batch_size=64,
            show_progress_bar=False
        )

        points = []
        for (mongo_id, title, lp_time_str), vector in zip(batch, vectors):
            points.append(
                PointStruct(
                    id=make_point_id(mongo_id),
                    vector=vector.tolist(),
                    payload={
                        "_id":     mongo_id,
                        "title":   title,
                        "lp_time": lp_time_str,
                    }
                )
            )

        qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
        print(" OK")
        return len(points), 0

    except Exception as e:
        print(f" ERROR: {e}")
        return 0, len(batch)


# ---------------------------------------------------
# MAIN
# ---------------------------------------------------

def main():
    print("=" * 60)
    print("MongoDB -> Qdrant Uploader")
    print(f"  Source : {MONGO_URI} / {MONGO_DB}.{MONGO_COLLECTION}")
    print(f"  Filter : category = 3")
    print(f"  Target : {QDRANT_URL} / {COLLECTION_NAME}")
    print("=" * 60)

    # 1. Connect to MongoDB
    print("\n[1/4] Connecting to MongoDB...")
    mongo_client = MongoClient(MONGO_URI)
    db           = mongo_client[MONGO_DB]
    collection   = db[MONGO_COLLECTION]

    total = collection.count_documents(MONGO_FILTER)
    print(f"      Found {total:,} documents with category=3")

    if total == 0:
        print("No documents found. Exiting.")
        return

    # 2. Connect to Qdrant
    print("\n[2/4] Connecting to Qdrant...")
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    print(f"      Connected. Collection: {COLLECTION_NAME}")

    # 3. Load model
    print(f"\n[3/4] Loading model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    model.max_seq_length = MAX_SEQ_LENGTH
    print("      Model ready.")

    # 4. Upload in batches
    print(f"\n[4/4] Starting upload in batches of {BATCH_SIZE}...\n")

    cursor    = collection.find(
        MONGO_FILTER,
        {FIELD_ID: 1, FIELD_TITLE: 1, FIELD_LP_TIME: 1}
    )

    inserted   = 0
    skipped    = 0
    errors     = 0
    batch      = []
    batch_num  = 0
    start_time = time.time()

    for doc in cursor:

        mongo_id = str(doc.get(FIELD_ID, ""))
        title    = (doc.get(FIELD_TITLE) or "").strip()
        lp_time  = doc.get(FIELD_LP_TIME)

        if not title or not mongo_id:
            skipped += 1
            continue

        batch.append((mongo_id, title, parse_lp_time(lp_time)))

        if len(batch) >= BATCH_SIZE:
            batch_num += 1
            ins, err   = process_batch(batch_num, batch, model, qdrant)
            inserted  += ins
            errors    += err
            batch      = []

            elapsed = time.time() - start_time
            rate    = inserted / elapsed if elapsed > 0 else 0
            eta_sec = (total - inserted - skipped - errors) / rate if rate > 0 else 0
            print(
                f"  Progress: {inserted:,}/{total:,} inserted | "
                f"{rate:.1f} docs/sec | ETA: {eta_sec/60:.1f} min"
            )

    # Process remaining docs
    if batch:
        batch_num += 1
        ins, err   = process_batch(batch_num, batch, model, qdrant)
        inserted  += ins
        errors    += err

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print("Upload Complete!")
    print(f"  Total processed : {total:,}")
    print(f"  Inserted        : {inserted:,}")
    print(f"  Skipped (empty) : {skipped:,}")
    print(f"  Errors          : {errors:,}")
    print(f"  Time taken      : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    if inserted > 0:
        print(f"  Avg speed       : {inserted/elapsed:.1f} docs/sec")
    print("=" * 60)

    mongo_client.close()


if __name__ == "__main__":
    main()
