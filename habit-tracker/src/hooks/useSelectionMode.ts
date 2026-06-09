import { useState, useCallback } from 'react';

export function useSelectionMode(items: { id: number }[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const enterSelection = useCallback((id: number) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(item => item.id)));
  }, [items]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  return { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection };
}
