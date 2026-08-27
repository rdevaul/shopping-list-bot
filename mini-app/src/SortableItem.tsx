import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useRef, useCallback } from 'react';

interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  is_staple: boolean;
  checked: boolean;
}

interface Props {
  item: ShoppingItem;
  onToggle: () => void;
  onDelete: (id: string) => void;
}

const SWIPE_THRESHOLD = 100; // px to commit delete

export function SortableItem({ item, onToggle, onDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({ id: item.id });

  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const startX = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  const touchStart = useCallback((e: React.TouchEvent) => {
    if (isDragging) return;
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }, [isDragging]);

  const touchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping) return;
    const dx = e.touches[0].clientX - startX.current;
    // Only allow swipe left (negative dx)
    if (dx < 0) {
      setSwipeX(dx);
    }
  }, [isSwiping]);

  const touchEnd = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (swipeX < -SWIPE_THRESHOLD) {
      // Past threshold — show confirm then delete
      setIsConfirming(true);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(
          `Remove "${item.name}" from the list?`,
          (ok) => {
            if (ok) {
              onDelete(item.id);
            } else {
              setSwipeX(0);
            }
            setIsConfirming(false);
          }
        );
      } else {
        if (confirm(`Remove "${item.name}" from the list?`)) {
          onDelete(item.id);
        } else {
          setSwipeX(0);
        }
        setIsConfirming(false);
      }
    } else {
      // Spring back
      setSwipeX(0);
    }
  }, [isSwiping, swipeX, item, onDelete]);

  // Drag transform (from dnd-kit) + swipe transform (from gesture)
  const dragTransform = transform ? CSS.Transform.toString(transform) : '';
  const swipeTransform = swipeX !== 0 ? `translateX(${swipeX}px)` : '';
  const combinedTransform = [dragTransform, swipeTransform].filter(Boolean).join(' ');

  return (
    <div className="item-wrapper" ref={ref}>
      {/* Delete background — revealed by swiping */}
      <div className="item-delete-bg">
        <span className="item-delete-label">🗑️ Delete</span>
      </div>
      {/* Foreground item */}
      <div
        ref={setNodeRef}
        style={{
          transform: combinedTransform,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out, opacity 0.2s',
          opacity: isDragging ? 0.5 : 1,
        }}
        className={`item ${item.checked ? 'checked' : ''} ${isConfirming ? 'confirming' : ''}`}
        onTouchStart={touchStart}
        onTouchMove={touchMove}
        onTouchEnd={touchEnd}
      >
        <div className="drag-handle" {...attributes} {...listeners}>
          ⋮⋮
        </div>
        <button className="checkbox" onClick={onToggle}>
          {item.checked ? '✅' : '⬜'}
        </button>
        <div className="item-content">
          <span className="item-name">{item.name}</span>
          {item.quantity && (
            <span className="item-quantity">{item.quantity}</span>
          )}
        </div>
      </div>
    </div>
  );
}
