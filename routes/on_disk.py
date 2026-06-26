import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient

# Load environment variables from .env file
load_dotenv()

QDRANT_HOST = os.getenv("QDRANT_HOST", "127.0.0.1")
QDRANT_PORT = os.getenv("QDRANT_PORT", "6333")
QDRANT_API_KEY = os.getenv("QDRANT_API")

print(f"Connecting to Qdrant at http://{QDRANT_HOST}:{QDRANT_PORT}...")
client = QdrantClient(
    url=f"http://{QDRANT_HOST}:{QDRANT_PORT}",
    api_key=QDRANT_API_KEY,
    timeout=120
)

print("Updating HNSW config to on_disk=True...")
res = client.update_collection(
    collection_name="clothing_products",
    hnsw_config={"on_disk": True}
)
print("HNSW on_disk configuration applied successfully! Response:", res)