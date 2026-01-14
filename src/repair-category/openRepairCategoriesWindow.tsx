import React from 'react';
import { createRoot } from 'react-dom/client';
import RepairCategoriesWindow from './RepairCategoriesWindow';

export function openRepairCategoriesWindow() {
  const newWin = window.open('', 'RepairCategories', 'width=1200,height=740');
  if (!newWin || newWin.closed) {
    window.location.href = '/repair-category';
    return;
  }

  // Copy existing styles
  Array.from(document.querySelectorAll('link[rel=stylesheet], style')).forEach(el => {
    const clone = el.cloneNode(true) as Node;
    newWin.document.head.appendChild(clone);
  });

  const mount = newWin.document.createElement('div');
  mount.id = 'repair-category-root';
  newWin.document.body.style.margin = '0';
  newWin.document.body.appendChild(mount);
  createRoot(mount).render(<RepairCategoriesWindow />);
}

export default openRepairCategoriesWindow;
