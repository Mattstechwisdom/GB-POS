import React from 'react';
import openRepairCategoriesWindow from './openRepairCategoriesWindow';

export default function RepairCategoryLauncher() {
  return (
    <button className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm" onClick={() => openRepairCategoriesWindow()}>
      Repair Category
    </button>
  );
}
