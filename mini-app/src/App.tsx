import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8200';

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

    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    
    const draggedItem = items[oldIndex];
    const targetItem = items[newIndex];

    // Check if dragging from one-off to staples section
    if (!draggedItem.is_staple && targetItem.is_staple) {
      // Prompt for promotion
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(
          `Make "${draggedItem.name}" a staple item?`,
          async (ok) => {
            if (ok) {
              await promoteToStaple(draggedItem.id);
              reorderItems(oldIndex, newIndex);
            }
          }
        );
      } else if (confirm(`Make "${draggedItem.name}" a staple item?`)) {
        await promoteToStaple(draggedItem.id);
        reorderItems(oldIndex, newIndex);
      }
      return;
    }

    reorderItems(oldIndex, newIndex);
  };

  const reorderItems = async (oldIndex: number, newIndex: number) => {
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);

    try {
      await fetch(`${API_URL}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: newItems.map(i => i.id) }),
      });
    } catch (e) {
      console.error('Failed to save order:', e);
    }
  };

  const promoteToStaple = async (id: string) => {
    setItems(prev => prev.map(i => 
      i.id === id ? { ...i, is_staple: true } : i
    ));

    try {
      await fetch(`${API_URL}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_staple: true }),
      });
    } catch (e) {
      console.error('Failed to promote item:', e);
    }
  };

  // Separate staples and one-offs
  const staples = items.filter(i => i.is_staple);
  const oneOffs = items.filter(i => !i.is_staple);

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
          {staples.length > 0 && (
            <section className="section">
              <h2>⭐ Staples</h2>
              <SortableContext
                items={staples.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {staples.map(item => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </SortableContext>
            </section>
          )}

          {oneOffs.length > 0 && (
            <section className="section">
              <h2>📝 One-offs</h2>
              <SortableContext
                items={oneOffs.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {oneOffs.map(item => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </SortableContext>
            </section>
          )}

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
