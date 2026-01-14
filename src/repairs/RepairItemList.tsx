import React, { useState, useEffect } from 'react';
import DevicePicker from '@/components/DevicePicker';
import type { RepairItem } from '../lib/types';

interface RepairItemListProps {
  items: RepairItem[];
  filteredItems: RepairItem[];
  selectedItem: RepairItem | null;
  onItemSelect: (item: RepairItem) => void;
  onFilteredItemsChange: (items: RepairItem[]) => void;
}

export default function RepairItemList({ 
  items, 
  filteredItems, 
  selectedItem, 
  onItemSelect, 
  onFilteredItemsChange 
}: RepairItemListProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // DevicePicker pulls categories on its own; we just store selection as filter
  // Map device name (sub) -> Title (main) for filtering by Title
  const [deviceTitleMap, setDeviceTitleMap] = useState<Map<string, string>>(new Map());

  // Load deviceCategories to build name -> title map
  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api.getDeviceCategories();
        const map = new Map<string, string>();
        (Array.isArray(list) ? list : []).forEach((d: any) => {
          if (d && typeof d.name === 'string') map.set(d.name, d.title || '');
        });
        setDeviceTitleMap(map);
      } catch (e) {
        setDeviceTitleMap(new Map());
      }
    })();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = items;

    // Category filter (supports device name OR Title)
    if (categoryFilter) {
      filtered = filtered.filter(item => {
        if (item.category === categoryFilter) return true; // device name match
        const title = deviceTitleMap.get(item.category || '');
        return !!title && title === categoryFilter;
      });
    }

    // Search filter (across title, type, model)
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search) ||
        (item.model && item.model.toLowerCase().includes(search))
      );
    }

    onFilteredItemsChange(filtered);
    setSelectedIndex(-1);
  }, [categoryFilter, searchText, items, onFilteredItemsChange]);

  // Handle search/find
  const handleFind = () => {
    // Search is already applied in useEffect
  };

  const handleShowAll = () => {
    setCategoryFilter('');
    setSearchText('');
  };

  const handleRowClick = (item: RepairItem, index: number) => {
    setSelectedIndex(index);
    onItemSelect(item);
  };

  const handleRowDoubleClick = (item: RepairItem) => {
    onItemSelect(item);
    // If opened as a child window, send selected repair to opener
    if (window.opener && typeof window.opener.postMessage === 'function') {
      window.opener.postMessage({ type: 'repair-selected', repair: item }, '*');
      window.close();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
        return; // Don't handle navigation when focused on inputs
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(0, selectedIndex - 1);
        setSelectedIndex(newIndex);
        if (filteredItems[newIndex]) {
          onItemSelect(filteredItems[newIndex]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(filteredItems.length - 1, selectedIndex + 1);
        setSelectedIndex(newIndex);
        if (filteredItems[newIndex]) {
          onItemSelect(filteredItems[newIndex]);
        }
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          onItemSelect(filteredItems[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredItems, onItemSelect]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex gap-2 mb-4 p-3 bg-zinc-800 rounded border border-zinc-700">
        {/* Category filter via Titles→Devices picker */}
  <DevicePicker value={categoryFilter} onChange={setCategoryFilter} onTitleSelect={setCategoryFilter} />

        {/* Search input */}
        <input
          type="text"
          placeholder="search products and services…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
        />

        {/* Find button */}
        <button
          onClick={handleFind}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
        >
          Find
        </button>

        {/* Show all button */}
        <button
          onClick={handleShowAll}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
        >
          Show all
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden border border-zinc-700 rounded">
        <div className="overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-zinc-700">Device</th>
                <th className="text-left p-2 border-b border-zinc-700">Repair</th>
                <th className="text-left p-2 border-b border-zinc-700">Repair Price</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item, index)}
                  onDoubleClick={() => handleRowDoubleClick(item)}
                  className={`
                    cursor-pointer border-l-2 hover:bg-zinc-800/50
                    ${selectedItem?.id === item.id ? 'border-l-[#39FF14] bg-zinc-800/30' : 'border-l-transparent'}
                    ${index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-850'}
                  `}
                >
                  <td className="p-2 border-b border-zinc-800">{item.category}</td>
                  <td className="p-2 border-b border-zinc-800">{item.title}</td>
                  <td className="p-2 border-b border-zinc-800 font-mono text-right">{typeof item.partCost === 'number' && typeof item.laborCost === 'number' ? (item.partCost + item.laborCost).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-400">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}