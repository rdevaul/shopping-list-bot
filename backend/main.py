"""
DeVaul Family Shopping List - Backend API
"""
import os
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Redis connection (optional)
REDIS_URL = os.getenv("UPSTASH_REDIS_URL")
REDIS_TOKEN = os.getenv("UPSTASH_REDIS_TOKEN")

# Local storage fallback
LOCAL_STORAGE_FILE = Path(__file__).parent / "shopping_list.json"

redis_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage Redis connection lifecycle."""
    global redis_client
    if REDIS_URL:
        try:
            import redis.asyncio as redis_lib
            redis_client = redis_lib.from_url(
                REDIS_URL,
                password=REDIS_TOKEN,
                decode_responses=True
            )
        except ImportError:
            print("Redis not installed, using local JSON storage")
    else:
        print("No Redis URL configured, using local JSON storage")
    yield
    if redis_client:
        await redis_client.close()


app = FastAPI(title="Shopping List API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Telegram Mini Apps need this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Models ==============

class ShoppingItem(BaseModel):
    id: str
    name: str  # Normalized name (e.g., "milk")
    quantity: Optional[str] = None  # e.g., "2 gallons"
    is_staple: bool = False
    checked: bool = False
    checked_at: Optional[datetime] = None
    position: int = 0
    added_by: int  # Telegram user ID
    added_at: datetime


class AddItemRequest(BaseModel):
    name: str
    quantity: Optional[str] = None
    is_staple: bool = False
    added_by: int


class UpdateItemRequest(BaseModel):
    checked: Optional[bool] = None
    is_staple: Optional[bool] = None
    position: Optional[int] = None
    quantity: Optional[str] = None


class ReorderRequest(BaseModel):
    item_ids: List[str]  # Ordered list of item IDs


# ============== Storage Helpers ==============

ITEMS_KEY = "shopping:items"


class Storage:
    """Abstract storage that uses Redis if available, otherwise local JSON."""
    
    @staticmethod
    async def load_items() -> List[ShoppingItem]:
        """Load all items from storage."""
        if redis_client:
            data = await redis_client.get(ITEMS_KEY)
            if not data:
                return []
            items_data = json.loads(data)
        else:
            # Local JSON fallback
            if not LOCAL_STORAGE_FILE.exists():
                return []
            items_data = json.loads(LOCAL_STORAGE_FILE.read_text())
        
        return [ShoppingItem(**item) for item in items_data]
    
    @staticmethod
    async def save_items(items: List[ShoppingItem]):
        """Save all items to storage."""
        items_data = [item.model_dump(mode='json') for item in items]
        json_str = json.dumps(items_data, default=str, indent=2)
        
        if redis_client:
            await redis_client.set(ITEMS_KEY, json_str)
        else:
            # Local JSON fallback
            LOCAL_STORAGE_FILE.write_text(json_str)


async def load_items() -> List[ShoppingItem]:
    return await Storage.load_items()


async def save_items(items: List[ShoppingItem]):
    await Storage.save_items(items)


# ============== API Endpoints ==============

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/items", response_model=List[ShoppingItem])
async def get_items():
    """Get all shopping items, sorted by staples first, then position."""
    items = await load_items()
    # Sort: staples first, then by position
    items.sort(key=lambda x: (not x.is_staple, x.position))
    return items


@app.post("/items", response_model=ShoppingItem)
async def add_item(req: AddItemRequest):
    """Add a new item or update quantity if exists."""
    items = await load_items()
    
    # Check if item already exists (by normalized name)
    normalized = req.name.lower().strip()
    existing = next((i for i in items if i.name.lower() == normalized), None)
    
    if existing:
        # Item exists - update quantity and uncheck if it was checked
        existing.quantity = req.quantity or existing.quantity
        existing.checked = False
        existing.checked_at = None
        await save_items(items)
        return existing
    
    # Create new item
    max_pos = max((i.position for i in items), default=-1)
    item = ShoppingItem(
        id=str(uuid.uuid4()),
        name=normalized,
        quantity=req.quantity,
        is_staple=req.is_staple,
        checked=False,
        position=max_pos + 1,
        added_by=req.added_by,
        added_at=datetime.utcnow()
    )
    items.append(item)
    await save_items(items)
    return item


@app.patch("/items/{item_id}", response_model=ShoppingItem)
async def update_item(item_id: str, req: UpdateItemRequest):
    """Update an item's properties."""
    items = await load_items()
    item = next((i for i in items if i.id == item_id), None)
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if req.checked is not None:
        item.checked = req.checked
        item.checked_at = datetime.utcnow() if req.checked else None
    
    if req.is_staple is not None:
        item.is_staple = req.is_staple
    
    if req.position is not None:
        item.position = req.position
    
    if req.quantity is not None:
        item.quantity = req.quantity
    
    await save_items(items)
    return item


@app.delete("/items/{item_id}")
async def delete_item(item_id: str):
    """Delete an item."""
    items = await load_items()
    items = [i for i in items if i.id != item_id]
    await save_items(items)
    return {"status": "deleted"}


@app.post("/items/reorder")
async def reorder_items(req: ReorderRequest):
    """Reorder items based on provided ID list."""
    items = await load_items()
    id_to_item = {i.id: i for i in items}
    
    for pos, item_id in enumerate(req.item_ids):
        if item_id in id_to_item:
            id_to_item[item_id].position = pos
    
    await save_items(items)
    return {"status": "reordered"}


@app.post("/cleanup")
async def cleanup_old_items():
    """Remove checked one-offs older than 24h, decay staple quantities."""
    items = await load_items()
    now = datetime.utcnow()
    cutoff = now - timedelta(hours=24)
    
    cleaned = []
    for item in items:
        if item.checked and item.checked_at:
            checked_time = item.checked_at
            if isinstance(checked_time, str):
                checked_time = datetime.fromisoformat(checked_time)
            
            if checked_time < cutoff:
                if item.is_staple:
                    # Decay quantity for staples
                    item.quantity = None
                    cleaned.append(item)
                else:
                    # Remove one-offs
                    continue
            else:
                cleaned.append(item)
        else:
            cleaned.append(item)
    
    await save_items(cleaned)
    return {"status": "cleaned", "removed": len(items) - len(cleaned)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8200)
