import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from './SortableItem';

// Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        close: () => void;
        expand: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        showConfirm: (message: string, callback: (ok: boolean) => void) => void;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          button_color?: string;
          button_text_color?: string;
        };
      };
    };
  }
}

interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  is_staple: boolean;
  checked: boolean;
  position: number;
}

// Use relative paths for Vercel API routes, or fall back to env var for local dev
const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize Telegram WebApp
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/items`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setItems(data);
      setError(null);
    } catch (e) {
      setError('Failed to load items');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Toggle item checked state
  const toggleItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;
    
    // Optimistic update
    setItems(prev => prev.map(i => 
      i.id === id ? { ...i, checked: newChecked } : i
    ));

    try {
      await fetch(`${API_URL}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: newChecked }),
      });
    } catch (e) {
      // Revert on error
      setItems(prev => prev.map(i => 
        i.id === id ? { ...i, checked: !newChecked } : i
      ));
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    // Use current sorted order for finding positions
    const currentSorted = [...items].sort((a, b) => {
      if (a.is_staple !== b.is_staple) return a.is_staple ? -1 : 1;
      return a.position - b.position;
    });

    const oldIndex = currentSorted.findIndex(i => i.id === active.id);
    const newIndex = currentSorted.findIndex(i => i.id === over.id);
    
    const draggedItem = currentSorted[oldIndex];
    const targetItem = currentSorted[newIndex];

    // Check if dragging from one-off to staples section (promote)
    if (!draggedItem.is_staple && targetItem.is_staple) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(
          `Make "${draggedItem.name}" a staple item?`,
          async (ok) => {
            if (ok) {
              await updateStapleStatus(draggedItem.id, true);
              reorderItems(oldIndex, newIndex);
            }
          }
        );
      } else if (confirm(`Make "${draggedItem.name}" a staple item?`)) {
        await updateStapleStatus(draggedItem.id, true);
        reorderItems(oldIndex, newIndex);
      }
      return;
    }

    // Check if dragging from staples to one-off section (demote)
    if (draggedItem.is_staple && !targetItem.is_staple) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(
          `Remove "${draggedItem.name}" from staples?`,
          async (ok) => {
            if (ok) {
              await updateStapleStatus(draggedItem.id, false);
              reorderItems(oldIndex, newIndex);
            }
          }
        );
      } else if (confirm(`Remove "${draggedItem.name}" from staples?`)) {
        await updateStapleStatus(draggedItem.id, false);
        reorderItems(oldIndex, newIndex);
      }
      return;
    }

    reorderItems(oldIndex, newIndex);
  };

  const reorderItems = async (oldIndex: number, newIndex: number) => {
    // Work with sorted array
    const currentSorted = [...items].sort((a, b) => {
      if (a.is_staple !== b.is_staple) return a.is_staple ? -1 : 1;
      return a.position - b.position;
    });
    
    const newSorted = arrayMove(currentSorted, oldIndex, newIndex);
    
    // Update positions based on new order
    const updatedItems = newSorted.map((item, idx) => ({
      ...item,
      position: idx
    }));
    
    setItems(updatedItems);

    try {
      await fetch(`${API_URL}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: newSorted.map(i => i.id) }),
      });
    } catch (e) {
      console.error('Failed to save order:', e);
    }
  };

  const updateStapleStatus = async (id: string, isStaple: boolean) => {
    setItems(prev => prev.map(i => 
      i.id === id ? { ...i, is_staple: isStaple } : i
    ));

    try {
      await fetch(`${API_URL}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_staple: isStaple }),
      });
      // Refresh to get proper sorting
      fetchItems();
    } catch (e) {
      console.error('Failed to update staple status:', e);
      // Revert on error
      setItems(prev => prev.map(i => 
        i.id === id ? { ...i, is_staple: !isStaple } : i
      ));
    }
  };

  // Sort items: staples first, then one-offs, preserving position within each group
  const sortedItems = [...items].sort((a, b) => {
    if (a.is_staple !== b.is_staple) return a.is_staple ? -1 : 1;
    return a.position - b.position;
  });

  const staples = sortedItems.filter(i => i.is_staple);
  const oneOffs = sortedItems.filter(i => !i.is_staple);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={fetchItems}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>🛒 Shopping List</h1>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <main>
          {/* Single SortableContext with all items for proper drag behavior */}
          <SortableContext
            items={sortedItems.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {staples.length > 0 && (
              <section className="section">
                <h2>⭐ Staples</h2>
                {staples.map(item => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </section>
            )}

            <section className="section">
              <h2>📝 One-offs</h2>
              {oneOffs.length > 0 ? (
                oneOffs.map(item => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))
              ) : (
                <div className="empty-section">
                  <p className="hint">Drag staples here to demote them</p>
                </div>
              )}
            </section>
          </SortableContext>

          {items.length === 0 && (
            <div className="empty">
              <p>No items yet!</p>
              <p className="hint">Ask GLaDOS to add something to the list.</p>
            </div>
          )}
        </main>
      </DndContext>
    </div>
  );
}

export default App;
