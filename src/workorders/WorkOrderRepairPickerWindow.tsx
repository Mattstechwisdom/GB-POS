import React, { useState, useEffect } from 'react';
import RepairItemList from '../repairs/RepairItemList';
import RepairItemForm from '../repairs/RepairItemForm';
import type { RepairItem } from '../lib/types';

export default function WorkOrderRepairPickerWindow() {
  const [repairItems, setRepairItems] = useState<RepairItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RepairItem | null>(null);
  const [filteredItems, setFilteredItems] = useState<RepairItem[]>([]);

  // Load repairs from DB on mount
  useEffect(() => {
    (async () => {
      if (window.api?.dbGet) {
        const items = await window.api.dbGet('repairCategories');
        if (Array.isArray(items)) setRepairItems(items);
      }
    })();
  }, []);

  const handleItemSelect = (item: RepairItem) => {
    setSelectedItem(item);
  };

  const handleCancel = () => {
    window.close();
  };

  function finalize(item: RepairItem) {
    if (!item) return;
    try {
      console.log('[Picker] finalize selection', item);
      if (window.api && typeof window.api.sendRepairSelected === 'function') {
        window.api.sendRepairSelected(item);
      } else if (window.opener && typeof window.opener.postMessage === 'function') {
        window.opener.postMessage({ type: 'repair-selected', repair: item }, '*');
      }
    } catch (e) {
      console.error('Failed to send repair-selected', e);
    }
    window.close();
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-gray-100">
      <div className="grid grid-cols-[620px_1fr] gap-4 h-full p-4">
        {/* Left pane: Item list */}
        <div className="flex flex-col">
          <RepairItemList 
            items={repairItems}
            filteredItems={filteredItems}
            selectedItem={selectedItem}
            onItemSelect={handleItemSelect}
            onFilteredItemsChange={setFilteredItems}
          />
        </div>
        {/* Right pane: Form */}
        <div className="flex flex-col">
          <RepairItemForm 
            selectedItem={selectedItem}
            onSave={(item) => finalize(item)}
            onCancel={handleCancel}
            mode="workorderpicker"
          />
        </div>
      </div>
    </div>
  );
}
