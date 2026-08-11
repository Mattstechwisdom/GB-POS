import React, { useState, useEffect, useMemo } from 'react';
import RepairItemList from '../repairs/RepairItemList';
import RepairItemForm from '../repairs/RepairItemForm';
import type { RepairItem } from '../lib/types';
import { consumeWindowPayload } from '../lib/windowPayload';
import { isRepairCatalogPreview, REPAIR_CATALOG_PREVIEW_ITEMS } from '../lib/repairCatalogPreview';

type WorkOrderRepairPickerProps = {
  initialDeviceCategory?: string;
  initialDeviceName?: string;
  onPick?: (item: RepairItem) => void;
  onClose?: () => void;
};

export default function WorkOrderRepairPickerWindow({ initialDeviceCategory = '', initialDeviceName = '', onPick, onClose }: WorkOrderRepairPickerProps = {}) {
  const [repairItems, setRepairItems] = useState<RepairItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RepairItem | null>(null);
  const [filteredItems, setFilteredItems] = useState<RepairItem[]>([]);
  const inheritedFilters = useMemo(() => {
    const stored = consumeWindowPayload('workOrderRepairPicker') || {};
    const params = new URLSearchParams(window.location.search);
    return {
      deviceCategory: initialDeviceCategory || String(stored.deviceCategory || params.get('deviceCategory') || ''),
      deviceName: initialDeviceName || String(stored.deviceName || params.get('deviceName') || ''),
    };
  }, [initialDeviceCategory, initialDeviceName]);

  // Load repairs from DB on mount
  useEffect(() => {
    (async () => {
      if (isRepairCatalogPreview()) setRepairItems(REPAIR_CATALOG_PREVIEW_ITEMS);
      if (window.api?.dbGet) {
        const items = await window.api.dbGet('repairCategories');
        const loaded = Array.isArray(items) ? items : [];
        setRepairItems(isRepairCatalogPreview() ? [...loaded, ...REPAIR_CATALOG_PREVIEW_ITEMS] : loaded);
      }
    })();
  }, []);

  const handleItemSelect = (item: RepairItem) => {
    setSelectedItem(item);
  };

  const handleCancel = () => {
    if (onClose) onClose();
    else window.close();
  };

  function finalize(item: RepairItem) {
    if (!item) return;
    if (onPick) {
      onPick(item);
      return;
    }
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
    <div className="gb-repair-picker-window flex h-screen overflow-hidden bg-zinc-900 text-gray-100">
      <div className="gb-repair-picker-layout grid grid-cols-[780px_1fr] gap-4 h-full p-4 overflow-hidden w-full">
        {/* Left pane: Item list */}
        <div className="gb-repair-picker-list-pane flex flex-col min-h-0">
          <RepairItemList 
            items={repairItems}
            filteredItems={filteredItems}
            selectedItem={selectedItem}
            onItemSelect={handleItemSelect}
            onFilteredItemsChange={setFilteredItems}
            initialDeviceCategory={inheritedFilters.deviceCategory}
            initialDeviceName={inheritedFilters.deviceName}
          />
        </div>
        {/* Right pane: Form */}
        <div className="gb-repair-picker-form-pane flex flex-col min-h-0">
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
