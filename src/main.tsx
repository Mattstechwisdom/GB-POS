import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CalendarWindow from './components/CalendarWindow';
import CustomerOverviewWindow from './components/CustomerOverviewWindow';
import NewWorkOrderWindow from './workorders/NewWorkOrderWindow';
import DeviceCategoriesWindow from './components/DeviceCategoriesWindow';
import RepairCategoriesWindow from './repairs/RepairCategoriesWindow';
import WorkOrderRepairPickerWindow from './workorders/WorkOrderRepairPickerWindow';
import CheckoutWindow from './workorders/CheckoutWindow';
import DevMenuWindow from './components/DevMenuWindow';
import DataToolsWindow from './components/DataToolsWindow';
import ReportingWindow from './components/ReportingWindow';
import ReleaseFormWindow from './workorders/ReleaseFormWindow';
import CustomerReceiptWindow from './workorders/CustomerReceiptWindow';
import SaleWindow from './sales/SaleWindow';
import ProductFormWindow from './sales/ProductFormWindow';
import ProductsWindow from './components/ProductsWindow';
import ChartsWindow from './components/ChartsWindow';
import BackupWindow from './components/BackupWindow';
import ClearDatabaseWindow from './components/ClearDatabaseWindow';
import ClockInWindow from './components/ClockInWindow';
import QuoteGeneratorWindow from './components/QuoteGeneratorWindow';
import './styles/index.css';

declare global {
	interface Window {
		__lastRepairSelected?: any;
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('error', (ev: any) => {
		try {
			document.body.innerHTML = '';
			const pre = document.createElement('pre');
			pre.style.color = 'salmon';
			pre.style.whiteSpace = 'pre-wrap';
			// Ensure we stringify errors safely for display
			const errMsg = ev?.message || ev?.error?.message || ev;
			pre.textContent = `Uncaught error: ${String(errMsg)}` + (ev?.error?.stack ? '\n' + String(ev.error.stack) : '');
			document.body.appendChild(pre);
		} catch (e) {
			// ignore
		}
	});
}

function getNewWorkOrderPayload() {
	try {
		const params = new URLSearchParams(window.location.search);
		const raw = params.get('newWorkOrder');
		if (!raw) return null;
		return JSON.parse(decodeURIComponent(raw));
	} catch (e) { 
		return null; 
	}
}

if (typeof window !== 'undefined') {
	if (typeof (window as any).api?.onRepairSelected === 'function') {
		(window as any).api.onRepairSelected((repair: any) => {
			window.__lastRepairSelected = repair;
		});
	}
}

try {
	const payload = getNewWorkOrderPayload();
	const params = new URLSearchParams(window.location.search);
	const showNewSale = params.get('newSale');
	const showDeviceCategories = params.get('deviceCategories');
	const showCustomerOverview = params.get('customerOverview');
	const showRepairCategories = params.get('repairCategories');
	const showWorkOrderRepairPicker = params.get('workOrderRepairPicker');
	const showCheckout = params.get('checkout');
	const showDevMenu = params.get('devMenu');
	const showDataTools = params.get('dataTools');
	const showCalendar = params.get('calendar');
	const showProducts = params.get('products');
	const showCharts = params.get('charts');
	const showReporting = params.get('reporting');
	const showQuote = params.get('quote');
	const showReleaseForm = params.get('releaseForm');
	const showCustomerReceipt = params.get('customerReceipt');
	const showProductForm = params.get('productForm');
	const showBackup = params.get('backup');
	const showClearDb = params.get('clearDb');
	const showClockIn = params.get('clockIn');
	
	const rootEl = document.getElementById('root');
	if (!rootEl) throw new Error('Missing #root element');
	const root = createRoot(rootEl);
	
	if (showDeviceCategories) {
		root.render(<DeviceCategoriesWindow />);
	} else if (showWorkOrderRepairPicker) {
		root.render(<WorkOrderRepairPickerWindow />);
	} else if (showRepairCategories) {
		const modeParam = params.get('mode');
		const mode = modeParam === 'admin' || modeParam === 'workorder' ? modeParam : 'admin';
		root.render(<RepairCategoriesWindow mode={mode} />);
	} else if (showCheckout) {
		root.render(<CheckoutWindow />);
	} else if (showCustomerOverview) {
		root.render(<CustomerOverviewWindow onClose={() => window.close()} closeOnSave={false} />);
	} else if (showDevMenu) {
		root.render(<DevMenuWindow />);
	} else if (showDataTools) {
		root.render(<DataToolsWindow />);
	} else if (showReporting) {
		root.render(<ReportingWindow />);
	} else if (showCharts) {
		root.render(<ChartsWindow />);
	} else if (showBackup) {
		root.render(<BackupWindow />);
	} else if (showClearDb) {
		root.render(<ClearDatabaseWindow />);
	} else if (showClockIn) {
		root.render(<ClockInWindow />);
	} else if (showQuote) {
		root.render(<QuoteGeneratorWindow />);
	} else if (showReleaseForm) {
		root.render(<ReleaseFormWindow />);
	} else if (showCustomerReceipt) {
		root.render(<CustomerReceiptWindow />);
	} else if (showCalendar) {
		root.render(<CalendarWindow />);
	} else if (showProductForm) {
		root.render(<ProductFormWindow />);
	} else if (showProducts) {
		root.render(<ProductsWindow />);
	} else if (showNewSale) {
		root.render(<SaleWindow />);
	} else if (payload) {
		root.render(<NewWorkOrderWindow />);
	} else {
		root.render(<App />);
	}

} catch (e: any) {
	console.error('Failed to mount app:', e);
	try {
		// Stringify the error to avoid injecting objects directly into innerHTML
		document.body.innerHTML = `<pre style="color: red;">${String(e)}</pre>`;
	}
	catch (ee) {
		console.error(ee);
	}
}
