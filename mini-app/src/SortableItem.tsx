import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
}

export function SortableItem({ item, onToggle }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`item ${item.checked ? 'checked' : ''}`}
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
  );
}
