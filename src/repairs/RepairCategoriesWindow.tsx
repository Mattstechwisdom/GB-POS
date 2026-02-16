// (removed stray top-level handleDelete)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import RepairItemList from '../repairs/RepairItemList';
import RepairItemForm from '../repairs/RepairItemForm';
import type { RepairItem } from '../lib/types';
import DeviceForm from '@/repairs/DeviceForm';

// No placeholder data for now

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // log error if needed
  }
  render() {
    if (this.state.error) {
      return <div style={{color:'salmon',background:'#18181b',padding:32}}><b>UI Error:</b> {this.state.error.message || String(this.state.error)}</div>;
    }
    return this.props.children;
  }
}

interface RepairCategoriesWindowProps {
  mode?: 'admin' | 'workorder';
}

export default function RepairCategoriesWindow({ mode = 'admin' }: RepairCategoriesWindowProps) {
  const [repairItems, setRepairItems] = useState<RepairItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RepairItem | null>(null);
  const [filteredItems, setFilteredItems] = useState<RepairItem[]>([]);
  const [paneMode, setPaneMode] = useState<'repair' | 'device'>('repair');
  const [deviceCategories, setDeviceCategories] = useState<Array<{ id: number; name: string; title?: string }>>([]);

  // Memoized list of existing sub-category titles for the Device form
  const deviceTitles = useMemo(() => {
    return Array.from(new Set((deviceCategories || []).map(d => (d as any).title).filter(Boolean))) as string[];
  }, [deviceCategories]);

  // Load repairs from DB on mount
  useEffect(() => {
    (async () => {
      if (window.api?.dbGet) {
        const items = await window.api.dbGet('repairCategories');
        if (Array.isArray(items)) setRepairItems(items);
        const devs = await window.api.dbGet('deviceCategories');
        setDeviceCategories(Array.isArray(devs) ? devs : []);
      }
    })();
    const off = (window as any).api?.onDeviceCategoriesChanged?.(async () => {
      try {
        const devs = await (window as any).api.dbGet('deviceCategories');
        setDeviceCategories(Array.isArray(devs) ? devs : []);
      } catch (e) {}
    });
    return () => { if (off) off(); };
  }, []);

  const handleItemSelect = (item: RepairItem) => {
    setSelectedItem(item);
  };

  const handleSave = async (item: RepairItem) => {
    if (mode === 'workorder') {
      // In workorder mode, do not persist edits, just update local state
      setSelectedItem(item); // allow editing in form
    } else {
      if (item.id && repairItems.some(i => i.id === item.id)) {
        // Edit existing item
        setRepairItems(prev => prev.map(i => i.id === item.id ? { ...i, ...item } : i));
        if (window.api?.dbUpdate) await window.api.dbUpdate('repairCategories', item.id, item);
      } else {
        // Add new item
        const newItem = {
          ...item,
          id: item.id || Math.random().toString(36).slice(2, 10),
        };
        setRepairItems(prev => [...prev, newItem]);
        if (window.api?.dbAdd) await window.api.dbAdd('repairCategories', newItem);
      }
      setSelectedItem(null);
    }
  };

  const handleDelete = async (itemId: string | number | undefined) => {
    if (!itemId) return;
    setRepairItems(prev => prev.filter(i => i.id !== itemId));
    if (window.api?.dbDelete) await window.api.dbDelete('repairCategories', itemId);
    setSelectedItem(null);
  };

  const handleCancel = () => {
    // TODO: Close window without changes
    console.log('Cancel repair item selection');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (selectedItem) {
          handleSave(selectedItem);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-zinc-900 text-gray-100">
        {/* Two-column grid: 620px | 1fr with 16px gap */}
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
            {/* Header actions: toggle between Repair and Device creation */}
            {mode === 'admin' && (
              <div className="flex justify-end gap-2 mb-4">
                <button
                  type="button"
                  className={`px-4 py-2 rounded text-sm border ${paneMode === 'repair' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-600 text-gray-100 hover:bg-zinc-700'}`}
                  onClick={() => { setPaneMode('repair'); setSelectedItem(null); }}
                >
                  Edit Repair
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded text-sm border ${paneMode === 'device' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-600 text-gray-100 hover:bg-zinc-700'}`}
                  onClick={() => setPaneMode('device')}
                >
                  Edit Devices
                </button>
              </div>
            )}
            {/** derive initial mappings for DeviceForm outside of JSX hooks to maintain hooks order */}
            {(() => {
              return null;
            })()}
            {paneMode === 'repair' ? (
              <RepairItemForm 
                selectedItem={selectedItem}
                onSave={handleSave}
                onCancel={handleCancel}
                onDelete={mode === 'admin' ? handleDelete : undefined}
                mode={mode}
                showCreateAction={false}
              />
            ) : (
              (() => {
                const initialDeviceName = selectedItem?.category;
                const initialTitleFromDevice = initialDeviceName ? (deviceCategories.find(d => d.name === initialDeviceName)?.title) : undefined;
                return (
              <DeviceForm
                titles={deviceTitles}
                devices={deviceCategories}
                initialDeviceName={initialDeviceName}
                initialTitle={initialTitleFromDevice}
                onCancel={() => setPaneMode('repair')}
                onSaved={async () => {
                  // Reload device categories to refresh titles list
                  try {
                    const devs = await window.api.dbGet('deviceCategories');
                    setDeviceCategories(Array.isArray(devs) ? devs : []);
                  } catch (e) {}
                }}
              />);
            })()
            )}
            {mode === 'workorder' && selectedItem && (
              <div className="flex justify-end mt-4">
                <button
                  className="px-4 py-2 bg-[#39FF14] hover:bg-[#32E610] text-black font-medium rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#39FF14] focus:ring-offset-2 focus:ring-offset-zinc-900"
                  onClick={() => {
                    // Send selected repair to opener and close
                    if (window.opener && typeof window.opener.postMessage === 'function') {
                      window.opener.postMessage({ type: 'repair-selected', repair: selectedItem }, '*');
                      window.close();
                    }
                  }}
                >
                  Add to Work Order
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}