from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
import os
from dotenv import load_dotenv
load_dotenv()

model = SentenceTransformer("sentence-transformers/paraphrase-MiniLM-L3-v2")
model.max_seq_length = 128

title = "Dhyeyu New Grey Embroidery Work Princess EP_01 Hijab Nose Piece For Muslim Women Chiffon Solid Abaya(Black)"
vec = model.encode(title, normalize_embeddings=True).tolist()

client = QdrantClient(url="http://127.0.0.1:6333", api_key=os.getenv("QDRANT_API"))
results = client.query_points(
    collection_name="clothing_products",
    query=vec,
    limit=5,
    with_payload=["_id", "title"],
    score_threshold=0.0   # no threshold — show all top results
)

print(f"Top results for: '{title}'\n")
for r in results.points:
    t = r.payload.get("title", "")
    print(f"  Score: {r.score:.4f} | Title: {t}")
