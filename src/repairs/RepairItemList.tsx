import React, { useState, useEffect, useRef } from 'react';
import DevicePicker from '@/components/DevicePicker';
import type { RepairItem } from '../lib/types';

interface RepairItemListProps {
  items: RepairItem[];
  filteredItems: RepairItem[];
  selectedItem: RepairItem | null;
  onItemSelect: (item: RepairItem) => void;
  onFilteredItemsChange: (items: RepairItem[]) => void;
  onItemContextMenu?: (e: React.MouseEvent, item: RepairItem) => void;
}

const PAGE_SIZE = 10;

function formatRepairMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function RepairItemList({
  items,
  filteredItems,
  selectedItem,
  onItemSelect,
  onFilteredItemsChange,
  onItemContextMenu,
}: RepairItemListProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [repairTypeFilter, setRepairTypeFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);
  const [listOpen, setListOpen] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [repairTypeOptions, setRepairTypeOptions] = useState<string[]>([]);

  const selectedIndexRef = useRef<number>(selectedIndex);
  const filteredItemsRef = useRef<RepairItem[]>(filteredItems);
  const onItemSelectRef = useRef<(item: RepairItem) => void>(onItemSelect);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { filteredItemsRef.current = filteredItems; }, [filteredItems]);
  useEffect(() => { onItemSelectRef.current = onItemSelect; }, [onItemSelect]);

  const [deviceTitleMap, setDeviceTitleMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api.getDeviceCategories();
        const map = new Map<string, string>();
        (Array.isArray(list) ? list : []).forEach((d: any) => {
          if (d && typeof d.name === 'string') map.set(d.name, d.title || '');
        });
        setDeviceTitleMap(map);
      } catch {
        setDeviceTitleMap(new Map());
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api.dbGet('repairTypes');
        const names = (Array.isArray(list) ? list : []).map((r: any) => String(r?.name || '').trim()).filter(Boolean);
        setRepairTypeOptions(names);
      } catch {
        setRepairTypeOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    let filtered = items;

    if (categoryFilter) {
      filtered = filtered.filter(item => {
        if (item.category === categoryFilter) return true;
        const title = deviceTitleMap.get(item.category || '');
        return !!title && title === categoryFilter;
      });
    }

    if (repairTypeFilter) {
      filtered = filtered.filter(item =>
        (item.repairCategory || '').toLowerCase() === repairTypeFilter.toLowerCase()
      );
    }

    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search) ||
        (item.model && item.model.toLowerCase().includes(search)) ||
        (item.repairCategory && item.repairCategory.toLowerCase().includes(search)) ||
        (item.category && item.category.toLowerCase().includes(search))
      );
    }

    onFilteredItemsChange(filtered);
    setSelectedIndex(-1);
    setPage(1);
  }, [categoryFilter, repairTypeFilter, searchText, items, onFilteredItemsChange, deviceTitleMap]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleShowAll = () => {
    setCategoryFilter('');
    setRepairTypeFilter('');
    setSearchText('');
  };

  const handleRowClick = (item: RepairItem, index: number) => {
    setSelectedIndex(index);
    onItemSelect(item);
  };

  const handleRowDoubleClick = (item: RepairItem) => {
    onItemSelect(item);
    if (window.opener && typeof window.opener.postMessage === 'function') {
      window.opener.postMessage({ type: 'repair-selected', repair: item }, '*');
      window.close();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
        return;
      }

      const currentIndex = selectedIndexRef.current;
      const currentItems = filteredItemsRef.current;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(0, currentIndex - 1);
        setSelectedIndex(newIndex);
        if (currentItems[newIndex]) onItemSelectRef.current(currentItems[newIndex]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(currentItems.length - 1, currentIndex + 1);
        setSelectedIndex(newIndex);
        if (currentItems[newIndex]) onItemSelectRef.current(currentItems[newIndex]);
      } else if (e.key === 'Enter' && currentIndex >= 0) {
        e.preventDefault();
        if (currentItems[currentIndex]) onItemSelectRef.current(currentItems[currentIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="gb-repair-list flex flex-col h-full min-h-0">
      <div className="gb-repair-toolbar mb-3 p-2 bg-zinc-800 rounded border border-zinc-700">
        <div className="gb-repair-search-row">
          <div className="gb-repair-search-shell">
            <button
              type="button"
              className={`gb-repair-filter-toggle ${filtersOpen ? 'active' : ''}`}
              onClick={() => setFiltersOpen(v => !v)}
              aria-label="Toggle repair filters"
              aria-expanded={filtersOpen}
            >
              <span aria-hidden="true"><i /><i /><i /></span>
            </button>
            <input
              type="text"
              placeholder="Search repairs..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="gb-repair-search-input"
            />
          </div>

        </div>

        {filtersOpen && (
          <div className="gb-repair-filter-row">
            <div className="gb-repair-filter-group">
              <span className="gb-repair-filter-label">Search by</span>
              <DevicePicker
                value={categoryFilter}
                onChange={setCategoryFilter}
                onTitleSelect={setCategoryFilter}
                className="gb-repair-device-picker"
              />
            </div>

            <label className="gb-repair-filter-group">
              <span className="gb-repair-filter-label">Filter</span>
              <select
                value={repairTypeFilter}
                onChange={e => setRepairTypeFilter(e.target.value)}
                className="gb-repair-type-filter bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none"
              >
                <option value="">All categories</option>
                {repairTypeOptions.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </label>

            <button
              onClick={handleShowAll}
              className="gb-repair-clear-button px-3 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-sm focus:border-[#39FF14] focus:outline-none"
            >
              Show all
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="gb-repair-list-toggle"
        onClick={() => setListOpen(v => !v)}
        aria-expanded={listOpen}
      >
        <span>{listOpen ? 'Hide' : 'Show'} Repair List</span>
        <strong>{filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}</strong>
      </button>

      {listOpen && (
        <div className="gb-repair-list-section">
          <div className="gb-repair-table-shell flex-1 overflow-hidden border border-zinc-700 rounded">
            <div className="gb-repair-table-scroll overflow-y-auto h-full">
              <table className="gb-repair-table w-full text-sm">
                <colgroup>
                  <col className="gb-repair-col-device" />
                  <col className="gb-repair-col-category" />
                  <col className="gb-repair-col-title" />
                  <col className="gb-repair-col-part" />
                  <col className="gb-repair-col-labor" />
                  <col className="gb-repair-col-total" />
                </colgroup>
                <thead className="bg-zinc-800 sticky top-0">
                  <tr>
                    <th className="text-left p-2 border-b border-zinc-700">Device</th>
                    <th className="text-left p-2 border-b border-zinc-700">Category</th>
                    <th className="text-left p-2 border-b border-zinc-700">Repair</th>
                    <th className="text-right p-2 border-b border-zinc-700"><abbr title="Parts">P</abbr></th>
                    <th className="text-right p-2 border-b border-zinc-700"><abbr title="Labor">L</abbr></th>
                    <th className="text-right p-2 border-b border-zinc-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item, index) => {
                    const total = typeof item.partCost === 'number' && typeof item.laborCost === 'number'
                      ? item.partCost + item.laborCost
                      : undefined;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleRowClick(item, pageStart + index)}
                        onDoubleClick={() => handleRowDoubleClick(item)}
                        onContextMenu={(e) => {
                          onItemContextMenu?.(e, item);
                        }}
                        className={`
                          cursor-pointer border-l-2 hover:bg-zinc-800/50
                          ${selectedItem?.id === item.id ? 'border-l-[#39FF14] bg-zinc-800/30' : 'border-l-transparent'}
                          ${(pageStart + index) % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-850'}
                        `}
                      >
                        <td data-label="Device" className="p-2 border-b border-zinc-800">{item.category}</td>
                        <td data-label="Category" className="p-2 border-b border-zinc-800 text-zinc-400 text-xs">{item.repairCategory || ''}</td>
                        <td data-label="Repair" className="p-2 border-b border-zinc-800">{item.title}</td>
                        <td data-label="Parts" className="p-2 border-b border-zinc-800 font-mono text-right">{formatRepairMoney(item.partCost)}</td>
                        <td data-label="Labor" className="p-2 border-b border-zinc-800 font-mono text-right">{formatRepairMoney(item.laborCost)}</td>
                        <td data-label="Total" className="p-2 border-b border-zinc-800 font-mono text-right">{formatRepairMoney(total)}</td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-400">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="gb-repair-pagination">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
            <label>
              <span>Page</span>
              <select value={safePage} onChange={e => setPage(Number(e.target.value) || 1)}>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(pageNumber => (
                  <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
                ))}
              </select>
              <span>of {totalPages}</span>
            </label>
            <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
