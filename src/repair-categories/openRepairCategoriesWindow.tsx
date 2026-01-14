import React from 'react';
import { createRoot } from 'react-dom/client';
import RepairCategoriesWindow from './RepairCategoriesWindow';

export function openRepairCategoriesWindow() {
  const newWin = window.open('', 'RepairCategories', 'width=1200,height=720');
  if (!newWin || newWin.closed) {
    // popup blocked — navigate in same tab
    window.location.href = '/repair-categories';
    return;
  }

  // inject stylesheet(s) — assumes index.css exists at /src/styles/index.css compiled into app
  const link = newWin.document.createElement('link');
  link.rel = 'stylesheet';
  // Try to copy existing stylesheet references from current document
  const existing = Array.from(document.querySelectorAll('link[rel=stylesheet], style'));
  existing.forEach((el) => {
    if (el.tagName === 'LINK') {
      const clone = el.cloneNode(true) as HTMLLinkElement;
      newWin.document.head.appendChild(clone);
    } else {
      const clone = el.cloneNode(true) as HTMLElement;
      newWin.document.head.appendChild(clone);
    }
  });

  // create a container and mount React root
  const container = newWin.document.createElement('div');
  container.id = 'repair-categories-root';
  // basic body styles
  newWin.document.body.style.margin = '0';
  newWin.document.body.appendChild(container);
  createRoot(container).render(<RepairCategoriesWindow />);
}

export default openRepairCategoriesWindow;
