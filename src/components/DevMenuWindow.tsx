import React, { useEffect, useRef, useState } from 'react';
import { computeTotals } from '../lib/calc';

type LogLevel = 'info' | 'warn' | 'error';
type LogEntry = { ts: string; level: LogLevel; message: string };

const DevMenuWindow: React.FC = () => {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [busy, setBusy] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const hasElectron = typeof (window as any).api !== 'undefined';
	const logScrollRef = useRef<HTMLDivElement | null>(null);
	const [info, setInfo] = useState<{ title: string; body: string } | null>(null);

	// Info catalog for actions
	const infoMap: Record<string, { title: string; body: string }> = {
		clearDatabase: {
			title: 'Clear Database',
			body: 'Opens a window to permanently remove selected collections from the local JSON database. Includes Select All/Deselect All and requires typing CLEAR to confirm. Make a backup first; this cannot be undone.'
		},
		validateWorkOrders: {
			title: 'Validate Work Orders',
			body: 'Checks each work order for totals consistency (subTotal, tax, total, remaining) and whether status should be closed if remaining is 0. Use when totals look off or after bulk edits.'
		},
		recalcTotalsDryRun: {
			title: 'Recalculate Totals (dry-run)',
			body: 'Recomputes what each work order totals would be and logs them without saving. Use to preview changes before applying auto-fixes.'
		},
		detectDuplicates: {
			title: 'Detect Duplicates',
			body: 'Finds potential duplicate customers (by phone and by name+phone) and technicians (by name/phone). Use periodically to keep contacts clean.'
		},
		detectOrphans: {
			title: 'Detect Orphans',
			body: 'Checks that every work order references an existing customer/technician. Use after imports or manual DB edits to catch broken links.'
		},
		validateTimeEntries: {
			title: 'Validate Time Entries',
			body: 'Verifies clock-in/out chronology and totalHours accuracy. Use when time tracking looks incorrect.'
		},
		checkInvoiceSequence: {
			title: 'Check Invoice Sequence',
			body: 'Reports the highest numeric ID among work orders and sales. Use if you suspect gaps or conflicts in numbering.'
		},
		validateSalesTotals: {
			title: 'Validate Sales Totals',
			body: 'Checks each sale record totals against a fresh calculation. Use when sales totals or balances appear incorrect.'
		},
		detectProductOrphans: {
			title: 'Detect Product Orphans',
			body: 'Finds products that reference missing product/device categories. Use after category cleanup or imports.'
		},
		detectLegacyScheduleEvents: {
			title: 'Detect Legacy Schedule Events',
			body: 'Lists old calendar events of type "schedule" that should no longer exist because the calendar derives from technicians. Use before purging legacy data.'
		},
		autoFixCommonIssues: {
			title: 'Auto-fix Work Orders',
			body: 'Merges exact duplicate customers (same first/last/phone), repoints their work orders, and fixes mismatched work order totals/status. Use for safe bulk cleanup.'
		},
		autoFixTimeEntries: {
			title: 'Auto-fix Time Entries',
			body: 'Swaps misordered clock-in/out and recomputes totalHours. Use to auto-correct common time entry mistakes.'
		},
		normalizeCustomerPhones: {
			title: 'Normalize Customer Phones',
			body: 'Strips non-digits from customer phone numbers to standardize storage. Use to improve duplicate detection and search.'
		},
		autoFixSalesTotals: {
			title: 'Auto-fix Sales Totals',
			body: 'Recomputes and saves totals for sales with mismatches. Use after changing tax settings or fixing line items.'
		},
		auditTechPasscodes: {
			title: 'Audit Tech Passcodes',
			body: 'Checks for invalid/missing 4-digit passcodes and duplicates across technicians. Use to prepare for passcode lock-in.'
		},
		autoFixTechPasscodes: {
			title: 'Auto-fix Tech Passcodes',
			body: 'Assigns unique 4-digit passcodes to missing or duplicate cases. Use with caution; communicate changes to staff.'
		},
		listUnclosedShifts: {
			title: 'List Unclosed Shifts',
			body: 'Shows all time entries with a clock-in but no clock-out. Use daily to ensure shifts are closed.'
		},
		clockOutAllOpenShifts: {
			title: 'Clock Out All Open Shifts',
			body: 'Closes all open shifts at the current time and computes hours. Use at day-end or before payroll reconciliation.'
		},
		purgeLegacyScheduleEvents: {
			title: 'Purge Legacy Schedule Events',
			body: 'Deletes legacy calendar events of type "schedule". Use only after reviewing detected items.'
		},
		openUserDataFolder: {
			title: 'Open User Data Folder',
			body: 'Opens the Electron userData directory where the JSON database resides. Useful for manual inspection or backup.'
		},
		environmentInfo: {
			title: 'Environment Info',
			body: 'Shows app and runtime environment details for troubleshooting.'
		},
		openAllDevTools: {
			title: 'Open All DevTools',
			body: 'Opens devtools for all windows for debugging UI and preload contexts.'
		},
		dbStats: {
			title: 'DB Stats',
			body: 'Lists collection sizes for a quick database health snapshot.'
		},
	};

	const InfoIcon: React.FC<{ infoKey: string }> = ({ infoKey }) => (
		<button
			type="button"
			aria-label="Info"
			className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 hover:border-[#39FF14] flex items-center justify-center"
			onClick={(e) => { e.stopPropagation(); const item = infoMap[infoKey]; setInfo(item || { title: 'Info', body: 'No description available for this action.' }); }}
		>
			i
		</button>
	);

	function log(level: LogLevel, message: string) {
		setLogs(prev => [{ ts: new Date().toLocaleTimeString(), level, message }, ...prev].slice(0, 500));
	}

		// Log controls
		function clearLog() { setLogs([]); }
		function exportLog() {
			try {
				const content = logs.map(l => `[${l.ts}] ${l.level.toUpperCase()}: ${l.message}`).reverse().join('\n');
				const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
				a.href = url; a.download = `dev-log-${ts}.txt`; a.click();
				setTimeout(() => URL.revokeObjectURL(url), 5000);
				log('info', 'Log exported');
			} catch (e: any) {
				log('error', `Export log failed: ${e?.message || String(e)}`);
			}
		}

		useEffect(() => {
			if (autoScroll && logScrollRef.current) {
				try { logScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
			}
		}, [logs, autoScroll]);

	async function openUserDataFolder() {
		setBusy(true);
			try {
				const res = await (window as any).api.devOpenUserDataFolder();
			if (res?.ok) log('info', `Opened userData folder: ${res.folder}`);
			else log('error', `Failed to open userData folder: ${res?.error || 'unknown'}`);
		} catch (e: any) { log('error', `Exception: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	async function environmentInfo() {
		setBusy(true);
		try {
			const res = await (window as any).api.devEnvironmentInfo();
			if (res?.ok) log('info', `Env: ${JSON.stringify(res)}`);
			else log('error', `Env query failed: ${res?.error || 'unknown'}`);
		} catch (e: any) { log('error', `Exception: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	async function openAllDevTools() {
		try {
			const res = await (window as any).api.devOpenAllDevTools();
			if (res?.ok) log('info', 'Opened devtools for all windows'); else log('error', res?.error || 'Failed to open devtools');
		} catch (e: any) { log('error', e?.message || String(e)); }
	}

	async function openReporting() {
		try {
			const api = (window as any).api;
			if (api && typeof api.openReporting === 'function') {
				await api.openReporting();
				log('info', 'Opened Reporting window');
			} else {
				const url = window.location.origin + '/?reporting=true';
				window.open(url, '_blank', 'noopener,noreferrer');
				log('warn', 'Electron bridge missing; opened Reporting in browser tab');
			}
		} catch (e: any) { log('error', `Open reporting failed: ${e?.message || String(e)}`); }
	}

	async function validateWorkOrders() {
		setBusy(true);
		try {
			const workOrders = await (window as any).api.getWorkOrders();
			let issues = 0;
			for (const w of workOrders) {
				const calc = computeTotals({
					laborCost: Number(w.laborCost || 0),
					partCosts: Number(w.partCosts || 0),
					discount: Number(w.discount || 0),
					taxRate: Number(w.taxRate || 0),
					amountPaid: Number(w.amountPaid || 0),
				});
				const t = w.totals || {};
				const mismatch = Math.abs((t.subTotal || 0) - calc.subTotal) > 0.01
					|| Math.abs((t.tax || 0) - calc.tax) > 0.01
					|| Math.abs((t.total || 0) - calc.total) > 0.01
					|| Math.abs((t.remaining || 0) - calc.remaining) > 0.01;
				if (mismatch) {
					issues++;
					log('warn', `WO ${w.id}: totals mismatch. stored=${JSON.stringify(t)} calc=${JSON.stringify(calc)}`);
				}
				const shouldBeClosed = calc.remaining === 0;
				if ((w.status === 'closed') !== shouldBeClosed) {
					issues++;
					log('warn', `WO ${w.id}: status should be ${shouldBeClosed ? 'closed' : 'open/in progress'} based on remaining=${calc.remaining}`);
				}
			}
			if (issues === 0) log('info', `Validated ${workOrders.length} work orders: no issues found.`);
			else log('warn', `Validated ${workOrders.length} work orders: ${issues} potential issues.`);
		} catch (e: any) { log('error', `Validation error: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	async function recalcTotalsDryRun() {
		setBusy(true);
		try {
			const workOrders = await (window as any).api.getWorkOrders();
			for (const w of workOrders) {
				const calc = computeTotals({
					laborCost: Number(w.laborCost || 0),
					partCosts: Number(w.partCosts || 0),
					discount: Number(w.discount || 0),
					taxRate: Number(w.taxRate || 0),
					amountPaid: Number(w.amountPaid || 0),
				});
				log('info', `WO ${w.id}: would set totals=${JSON.stringify(calc)}`);
			}
			log('info', 'Dry-run complete. No data was modified.');
		} catch (e: any) { log('error', `Dry-run error: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

		// Data validation: detect duplicates in customers, technicians, and verify work order totals/status
		async function detectDuplicates() {
			setBusy(true);
			try {
				const [customers, technicians, workOrders] = await Promise.all([
					(window as any).api.dbGet('customers'),
					(window as any).api.dbGet('technicians'),
					(window as any).api.dbGet('workOrders'),
				]);
				const norm = (s: any) => (s || '').toString().replace(/[^0-9a-z]/gi, '').toLowerCase();
				// Customers
				const byPhone = new Map<string, any[]>();
				const byNamePhone = new Map<string, any[]>();
				for (const c of customers || []) {
					const keyP = norm(c.phone);
					const keyNP = `${norm(c.firstName)}|${norm(c.lastName)}|${keyP}`;
					if (keyP) byPhone.set(keyP, [...(byPhone.get(keyP) || []), c]);
					if (keyNP) byNamePhone.set(keyNP, [...(byNamePhone.get(keyNP) || []), c]);
				}
				let custDupes = 0;
				for (const [k, arr] of byPhone.entries()) if (arr.length > 1) { custDupes += arr.length; log('warn', `Customer duplicate phone ${k}: IDs ${arr.map(x => x.id).join(', ')}`); }
				for (const [k, arr] of byNamePhone.entries()) if (arr.length > 1) { custDupes += arr.length; log('warn', `Customer duplicate name+phone ${k}: IDs ${arr.map(x => x.id).join(', ')}`); }

				// Technicians
				const techByName = new Map<string, any[]>();
				const techByPhone = new Map<string, any[]>();
				for (const t of technicians || []) {
					const keyN = `${norm(t.firstName)}|${norm(t.lastName)}|${norm(t.nickname)}`;
					const keyP = norm(t.phone);
					if (keyN) techByName.set(keyN, [...(techByName.get(keyN) || []), t]);
					if (keyP) techByPhone.set(keyP, [...(techByPhone.get(keyP) || []), t]);
				}
				let techDupes = 0;
				for (const [k, arr] of techByName.entries()) if (arr.length > 1) { techDupes += arr.length; log('warn', `Technician duplicate name ${k}: IDs ${arr.map(x => x.id).join(', ')}`); }
				for (const [k, arr] of techByPhone.entries()) if (arr.length > 1) { techDupes += arr.length; log('warn', `Technician duplicate phone ${k}: IDs ${arr.map(x => x.id).join(', ')}`); }

				// Work orders: totals/status consistency
				let woIssues = 0;
				for (const w of workOrders || []) {
					const calc = computeTotals({
						laborCost: Number(w.laborCost || 0),
						partCosts: Number(w.partCosts || 0),
						discount: Number(w.discount || 0),
						taxRate: Number(w.taxRate || 0),
						amountPaid: Number(w.amountPaid || 0),
					});
					const t = w.totals || {};
					const mismatch = Math.abs((t.subTotal || 0) - calc.subTotal) > 0.01
						|| Math.abs((t.tax || 0) - calc.tax) > 0.01
						|| Math.abs((t.total || 0) - calc.total) > 0.01
						|| Math.abs((t.remaining || 0) - calc.remaining) > 0.01;
					if (mismatch) { woIssues++; log('warn', `WO ${w.id}: totals mismatch. stored=${JSON.stringify(t)} calc=${JSON.stringify(calc)}`); }
					const shouldBeClosed = calc.remaining === 0;
					if ((w.status === 'closed') !== shouldBeClosed) { woIssues++; log('warn', `WO ${w.id}: status should be ${shouldBeClosed ? 'closed' : 'open/in progress'} (remaining=${calc.remaining})`); }
				}
				log('info', `Duplicates — customers: ${custDupes}, technicians: ${techDupes}. Work order issues: ${woIssues}.`);
			} catch (e: any) {
				log('error', `Duplicate detection failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		// Auto-fix common issues: de-duplicate safely and fix work order totals/status
		async function autoFixCommonIssues() {
			setBusy(true);
			try {
				const db = async (key: string) => (window as any).api.dbGet(key);
				const [customers, workOrders] = await Promise.all([db('customers'), db('workOrders')]);
				const norm = (s: any) => (s || '').toString().replace(/[^0-9a-z]/gi, '').toLowerCase();

				// 1) Merge exact duplicate customers by (first,last,phone) keeping lowest id. Repoint workOrders.customerId.
				const groups = new Map<string, any[]>();
				for (const c of customers || []) {
					const k = `${norm(c.firstName)}|${norm(c.lastName)}|${norm(c.phone)}`;
					groups.set(k, [...(groups.get(k) || []), c]);
				}
				let merged = 0;
				for (const arr of groups.values()) {
					if (arr.length <= 1) continue;
					arr.sort((a, b) => Number(a.id) - Number(b.id));
					const keeper = arr[0];
					const dupes = arr.slice(1);
					// Repoint work orders
					for (const d of dupes) {
						for (const w of workOrders || []) {
							if (Number(w.customerId) === Number(d.id)) {
								w.customerId = keeper.id;
							}
						}
					}
					// Remove dupes from customers
					for (const d of dupes) {
						await (window as any).api.dbDelete('customers', d.id);
						merged++;
						log('info', `Merged customer ${d.id} -> ${keeper.id}`);
					}
				}
				// Persist any work order reassignment
				for (const w of workOrders || []) {
					await (window as any).api.dbUpdate('workOrders', w.id, w);
				}

				// 2) Fix work order totals/status where mismatched
				let fixedTotals = 0;
				for (const w of workOrders || []) {
					const calc = computeTotals({
						laborCost: Number(w.laborCost || 0),
						partCosts: Number(w.partCosts || 0),
						discount: Number(w.discount || 0),
						taxRate: Number(w.taxRate || 0),
						amountPaid: Number(w.amountPaid || 0),
					});
					const t = w.totals || {};
					const mismatch = Math.abs((t.subTotal || 0) - calc.subTotal) > 0.01
						|| Math.abs((t.tax || 0) - calc.tax) > 0.01
						|| Math.abs((t.total || 0) - calc.total) > 0.01
						|| Math.abs((t.remaining || 0) - calc.remaining) > 0.01;
					if (mismatch) {
						const shouldBeClosed = calc.remaining === 0;
						const next = { ...w, totals: calc, status: shouldBeClosed ? 'closed' : (w.status || 'open') };
						await (window as any).api.dbUpdate('workOrders', w.id, next);
						fixedTotals++;
					}
				}
				log('info', `Auto-fix complete. Merged customers: ${merged}. Fixed work order totals/status: ${fixedTotals}.`);
			} catch (e: any) {
				log('error', `Auto-fix failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		useEffect(() => { log('info', 'Dev Menu ready'); }, []);

		// Detect orphaned references (workOrders -> customers/technicians)
		async function detectOrphans() {
			setBusy(true);
			try {
				const [customers, technicians, workOrders] = await Promise.all([
					(window as any).api.dbGet('customers'),
					(window as any).api.dbGet('technicians'),
					(window as any).api.dbGet('workOrders'),
				]);
				const custSet = new Set((customers || []).map((c: any) => Number(c.id)));
				const techSet = new Set((technicians || []).map((t: any) => String(t.id)));
				let orphanCount = 0;
				for (const w of workOrders || []) {
					if (!custSet.has(Number(w.customerId))) {
						orphanCount++;
						log('warn', `WO ${w.id}: references missing customerId=${w.customerId}`);
					}
					if (w.assignedTo && !techSet.has(String(w.assignedTo))) {
						log('warn', `WO ${w.id}: references missing technician id=${w.assignedTo}`);
					}
				}
				if (orphanCount === 0) log('info', 'No orphaned work order references found.');
			} catch (e: any) {
				log('error', `Orphan detection failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		// Validate time entries
		async function validateTimeEntries() {
			setBusy(true);
			try {
				const entries = await (window as any).api.dbGet('timeEntries') || [];
				let issues = 0;
				for (const e of entries) {
					const inAt = e.clockIn ? new Date(e.clockIn) : null;
					const outAt = e.clockOut ? new Date(e.clockOut) : null;
					if (!inAt) { issues++; log('warn', `TimeEntry ${e.id}: missing clockIn`); continue; }
					if (outAt && outAt < inAt) { issues++; log('warn', `TimeEntry ${e.id}: clockOut before clockIn (${e.clockIn} > ${e.clockOut})`); }
					if (outAt && typeof e.totalHours === 'number') {
						const hours = Math.max(0, (outAt.getTime() - inAt.getTime()) / 36e5);
						if (Math.abs(hours - e.totalHours) > 0.01) { issues++; log('warn', `TimeEntry ${e.id}: totalHours mismatch stored=${e.totalHours} calc=${hours.toFixed(2)}`); }
					}
				}
				if (issues === 0) log('info', `Validated ${entries.length} time entries: no issues found.`);
				else log('warn', `Validated ${entries.length} time entries: ${issues} potential issues.`);
			} catch (e: any) {
				log('error', `Validate time entries failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		// Auto-fix time entries (recompute totalHours, swap misordered times)
		async function autoFixTimeEntries() {
			setBusy(true);
			try {
				const entries = await (window as any).api.dbGet('timeEntries') || [];
				let fixed = 0;
				for (const e of entries) {
					const inAt = e.clockIn ? new Date(e.clockIn) : null;
					const outAt = e.clockOut ? new Date(e.clockOut) : null;
					if (!inAt || !outAt) continue;
					let cin = inAt, cout = outAt;
					if (cout < cin) { const tmp = cin; cin = cout; cout = tmp; }
					const hours = Math.max(0, (cout.getTime() - cin.getTime()) / 36e5);
					if (e.clockIn !== cin.toISOString() || e.clockOut !== cout.toISOString() || Math.abs(hours - (e.totalHours || 0)) > 0.01) {
						const next = { ...e, clockIn: cin.toISOString(), clockOut: cout.toISOString(), totalHours: Number(hours.toFixed(2)) };
						await (window as any).api.dbUpdate('timeEntries', e.id, next);
						fixed++;
					}
				}
				log('info', `Auto-fix time entries complete. Updated ${fixed} entries.`);
			} catch (e: any) {
				log('error', `Auto-fix time entries failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		// Check invoice sequence against max(workOrders,sales)
		async function checkInvoiceSequence() {
			setBusy(true);
			try {
				const [workOrders, sales] = await Promise.all([
					(window as any).api.dbGet('workOrders'),
					(window as any).api.dbGet('sales'),
				]);
				const maxWO = (workOrders || []).reduce((m: number, it: any) => Math.max(m, Number(it.id) || 0), 0);
				const maxSA = (sales || []).reduce((m: number, it: any) => Math.max(m, Number(it.id) || 0), 0);
				const maxId = Math.max(maxWO, maxSA);
				log('info', `Invoice sequence check: highest ID among workOrders/sales is ${maxId}.`);
				log('info', `New work orders/sales will be assigned id > ${maxId} automatically.`);
			} catch (e: any) {
				log('error', `Invoice sequence check failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

		// Normalize customer phone numbers (digits-only, preserve last 10-11 digits)
		async function normalizeCustomerPhones() {
			setBusy(true);
			try {
				const customers = await (window as any).api.dbGet('customers');
				let changed = 0;
				const clean = (p: any) => String(p || '').replace(/\D/g, '');
				for (const c of customers || []) {
					const raw = c.phone;
					const normalized = clean(raw);
					if (normalized !== (raw || '')) {
						const next = { ...c, phone: normalized };
						await (window as any).api.dbUpdate('customers', c.id, next);
						changed++;
					}
				}
				log('info', `Normalized phones for ${changed} customers.`);
			} catch (e: any) {
				log('error', `Normalize phones failed: ${e?.message || String(e)}`);
			} finally { setBusy(false); }
		}

	// Validate sales totals
	async function validateSalesTotals() {
		setBusy(true);
		try {
			const sales = await (window as any).api.dbGet('sales');
			let issues = 0;
			for (const s of sales || []) {
				const calc = computeTotals({
					laborCost: Number(s.laborCost || 0),
					partCosts: Number(s.partCosts || 0),
					discount: Number(s.discount || 0),
					taxRate: Number(s.taxRate || 0),
					amountPaid: Number(s.amountPaid || 0),
				});
				const t = s.totals || {};
				const mismatch = Math.abs((t.subTotal || 0) - calc.subTotal) > 0.01
					|| Math.abs((t.tax || 0) - calc.tax) > 0.01
					|| Math.abs((t.total || 0) - calc.total) > 0.01
					|| Math.abs((t.remaining || 0) - calc.remaining) > 0.01;
				if (mismatch) { issues++; log('warn', `Sale ${s.id}: totals mismatch. stored=${JSON.stringify(t)} calc=${JSON.stringify(calc)}`); }
			}
			if (issues === 0) log('info', `Validated ${sales?.length || 0} sales: no issues found.`);
			else log('warn', `Validated ${sales?.length || 0} sales: ${issues} potential issues.`);
		} catch (e: any) {
			log('error', `Validate sales failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Auto-fix sales totals
	async function autoFixSalesTotals() {
		setBusy(true);
		try {
			const sales = await (window as any).api.dbGet('sales');
			let fixed = 0;
			for (const s of sales || []) {
				const calc = computeTotals({
					laborCost: Number(s.laborCost || 0),
					partCosts: Number(s.partCosts || 0),
					discount: Number(s.discount || 0),
					taxRate: Number(s.taxRate || 0),
					amountPaid: Number(s.amountPaid || 0),
				});
				const t = s.totals || {};
				const mismatch = Math.abs((t.subTotal || 0) - calc.subTotal) > 0.01
					|| Math.abs((t.tax || 0) - calc.tax) > 0.01
					|| Math.abs((t.total || 0) - calc.total) > 0.01
					|| Math.abs((t.remaining || 0) - calc.remaining) > 0.01;
				if (mismatch) {
					const next = { ...s, totals: calc };
					await (window as any).api.dbUpdate('sales', s.id, next);
					fixed++;
				}
			}
			log('info', `Auto-fix sales totals complete. Fixed ${fixed} sales.`);
		} catch (e: any) {
			log('error', `Auto-fix sales failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Technician passcode audit
	async function auditTechPasscodes() {
		setBusy(true);
		try {
			const techs = await (window as any).api.dbGet('technicians') || [];
			const norm = (p: any) => String(p || '').replace(/\D/g, '').slice(0,4);
			const used = new Map<string, any[]>();
			let invalid = 0;
			for (const t of techs) {
				const code = norm(t.passcode);
				if (!code || code.length !== 4) { invalid++; log('warn', `Technician ${t.id}: missing/invalid passcode`); continue; }
				used.set(code, [...(used.get(code) || []), t]);
			}
			for (const [code, arr] of used.entries()) if (arr.length > 1) { log('warn', `Duplicate passcode ${code}: tech IDs ${arr.map(x => x.id).join(', ')}`); }
			log('info', `Passcode audit complete. Invalid/missing: ${invalid}. Duplicate codes: ${[...used.entries()].filter(([_,a])=>a.length>1).length}.`);
		} catch (e: any) {
			log('error', `Passcode audit failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Auto-fix technician passcodes (assign unique 4-digit to missing/duplicates)
	async function autoFixTechPasscodes() {
		setBusy(true);
		try {
			const techs = await (window as any).api.dbGet('technicians') || [];
			const norm = (p: any) => String(p || '').replace(/\D/g, '').slice(0,4);
			const used = new Set<string>();
			for (const t of techs) { const c = norm(t.passcode); if (c.length === 4 && !used.has(c)) used.add(c); }
			function genUnique(): string {
				for (let i=0;i<10000;i++) { const code = Math.floor(1000 + Math.random()*9000).toString(); if (!used.has(code)) { used.add(code); return code; } }
				return '0000';
			}
			let changed = 0;
			const byCode = new Map<string, any[]>();
			for (const t of techs) { const c = norm(t.passcode); if (!c || c.length !== 4) continue; byCode.set(c, [...(byCode.get(c) || []), t]); }
			for (const [_, arr] of byCode.entries()) {
				if (arr.length <= 1) continue;
				arr.sort((a,b) => String(a.id).localeCompare(String(b.id)));
				for (let i=1;i<arr.length;i++) { const t = arr[i]; const newCode = genUnique(); await (window as any).api.dbUpdate('technicians', t.id, { ...t, passcode: newCode }); changed++; log('info', `Technician ${t.id}: reassigned duplicate passcode -> ${newCode}`); }
			}
			for (const t of techs) { const c = norm(t.passcode); if (c.length !== 4) { const newCode = genUnique(); await (window as any).api.dbUpdate('technicians', t.id, { ...t, passcode: newCode }); changed++; log('info', `Technician ${t.id}: assigned new passcode ${newCode}`); } }
			log('info', `Passcode auto-fix complete. Updated ${changed} technicians.`);
		} catch (e: any) {
			log('error', `Auto-fix passcodes failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// List unclosed shifts
	async function listUnclosedShifts() {
		setBusy(true);
		try {
			const [entries, techs] = await Promise.all([
				(window as any).api.dbGet('timeEntries'),
				(window as any).api.dbGet('technicians'),
			]);
			const byId = new Map((techs || []).map((t: any) => [String(t.id), t]));
			const open = (entries || []).filter((e: any) => e.clockIn && !e.clockOut);
			if (open.length === 0) { log('info', 'No unclosed shifts found.'); return; }
			for (const e of open) { const t: any = byId.get(String(e.technicianId)) || {}; log('warn', `Open shift ${e.id}: tech=${t.firstName || ''} ${t.lastName || ''} (${e.technicianId}) since ${e.clockIn}`); }
			log('info', `Total unclosed shifts: ${open.length}`);
		} catch (e: any) {
			log('error', `List unclosed shifts failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Clock out all open shifts (now)
	async function clockOutAllOpenShifts() {
		setBusy(true);
		try {
			const entries = await (window as any).api.dbGet('timeEntries') || [];
			const now = new Date();
			let changed = 0;
			for (const e of entries) {
				if (e.clockIn && !e.clockOut) {
					const cin = new Date(e.clockIn);
					const hours = Math.max(0, (now.getTime() - cin.getTime()) / 36e5);
					const next = { ...e, clockOut: now.toISOString(), totalHours: Number(hours.toFixed(2)) };
					await (window as any).api.dbUpdate('timeEntries', e.id, next);
					changed++;
				}
			}
			log('info', `Clocked out ${changed} open shifts at current time.`);
		} catch (e: any) {
			log('error', `Clock out open shifts failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Product/category orphan checks
	async function detectProductOrphans() {
		setBusy(true);
		try {
			const [products, prodCats, devCats] = await Promise.all([
				(window as any).api.dbGet('products'),
				(window as any).api.dbGet('productCategories'),
				(window as any).api.dbGet('deviceCategories'),
			]);
			const pSet = new Set((prodCats || []).map((c: any) => (c.name || c.title || c.id)));
			const dSet = new Set((devCats || []).map((c: any) => (c.name || c.title || c.id)));
			let issues = 0;
			for (const p of products || []) {
				const pc = p.productCategory || p.category || p.categoryId;
				const dc = p.deviceCategory || p.deviceCategoryId;
				if (pc && !pSet.has(pc)) { issues++; log('warn', `Product ${p.id || p.title}: missing productCategory=${pc}`); }
				if (dc && !dSet.has(dc)) { issues++; log('warn', `Product ${p.id || p.title}: missing deviceCategory=${dc}`); }
			}
			if (issues === 0) log('info', 'No product/category orphan issues found.');
		} catch (e: any) {
			log('error', `Detect product orphans failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Calendar legacy schedule events detection
	async function detectLegacyScheduleEvents() {
		setBusy(true);
		try {
			const events = await (window as any).api.dbGet('calendarEvents');
			const legacy = (events || []).filter((ev: any) => ev.category === 'schedule');
			if (!legacy.length) { log('info', 'No legacy schedule events found in calendarEvents.'); return; }
			for (const ev of legacy) log('warn', `Legacy schedule event ${ev.id}: ${ev.title || ''} on ${ev.date}`);
			log('info', `Found ${legacy.length} legacy schedule events.`);
		} catch (e: any) { log('error', `Detect legacy schedule events failed: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	async function purgeLegacyScheduleEvents() {
		setBusy(true);
		try {
			const events = await (window as any).api.dbGet('calendarEvents');
			const legacy = (events || []).filter((ev: any) => ev.category === 'schedule');
			let removed = 0;
			for (const ev of legacy) { await (window as any).api.dbDelete('calendarEvents', ev.id); removed++; }
			log('info', `Purged ${removed} legacy schedule events.`);
		} catch (e: any) { log('error', `Purge legacy schedule events failed: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	// DB Stats (collection sizes)
	async function dbStats() {
		setBusy(true);
		try {
			const keys = ['technicians','customers','workOrders','sales','calendarEvents','products','productCategories','deviceCategories','timeEntries','partSources'];
			const results = await Promise.all(keys.map(k => (window as any).api.dbGet(k).then((v: any) => ({ k, n: (v||[]).length })).catch(() => ({ k, n: 0 }))));
			for (const r of results) log('info', `Collection ${r.k}: ${r.n}`);
		} catch (e: any) { log('error', `DB stats failed: ${e?.message || String(e)}`); } finally { setBusy(false); }
	}

	// Backup verify: pick a backup and report collection counts
	async function backupVerify() {
		setBusy(true);
		try {
			const res = await (window as any).api.backupPickAndRead();
			const data: any = res?.data || res?.allData || res || {};
			if (!data || typeof data !== 'object') { log('error', 'Backup verify: no data read'); return; }
			const keys = Object.keys(data);
			log('info', `Backup opened. Collections: ${keys.join(', ')}`);
			for (const k of keys) {
				const v = (data as any)[k];
				const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' && Array.isArray(v.items) ? v.items.length : 0);
				log('info', ` - ${k}: ${n}`);
			}
		} catch (e: any) {
			log('error', `Backup verify failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

	// Export collections snapshot (JSON file) for quick analysis
	async function exportCollectionsSnapshot() {
		setBusy(true);
		try {
			const keys = ['technicians','customers','workOrders','sales','calendarEvents','products','productCategories','deviceCategories','timeEntries','partSources'];
			const payload: any = {};
			for (const k of keys) {
				try { payload[k] = await (window as any).api.dbGet(k); } catch { payload[k] = []; }
			}
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
			a.href = url; a.download = `gbpos-snapshot-${ts}.json`; a.click();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			log('info', 'Exported collections snapshot.');
		} catch (e: any) {
			log('error', `Export snapshot failed: ${e?.message || String(e)}`);
		} finally { setBusy(false); }
	}

		return (
				<div className="h-screen bg-zinc-900 text-gray-100 p-4">
					<div className="text-xl font-bold mb-4">Developer Menu</div>
				{!hasElectron && (
					<div className="mb-4 text-sm text-yellow-300">Electron bridge not detected. Actions are disabled in browser preview; open via the Electron app to use these tools.</div>
				)}
						<div className="h-[calc(100%-4rem)] flex gap-4">
							{/* Left sidebar: grouped actions (scrollable only here) */}
							<aside className="w-96 shrink-0 space-y-4 overflow-y-auto pr-1">
						<section className="bg-zinc-950 border border-zinc-800 rounded p-3">
							<div className="text-sm font-semibold text-zinc-300 mb-2">Validation</div>
							<div className="space-y-2">
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={validateWorkOrders} disabled={busy || !hasElectron}>Validate Work Orders</button>
										<InfoIcon infoKey="validateWorkOrders" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={recalcTotalsDryRun} disabled={busy || !hasElectron}>Recalculate Totals (dry-run)</button>
										<InfoIcon infoKey="recalcTotalsDryRun" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={detectDuplicates} disabled={busy || !hasElectron}>Detect Duplicates</button>
										<InfoIcon infoKey="detectDuplicates" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={detectOrphans} disabled={busy || !hasElectron}>Detect Orphans</button>
										<InfoIcon infoKey="detectOrphans" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={validateTimeEntries} disabled={busy || !hasElectron}>Validate Time Entries</button>
										<InfoIcon infoKey="validateTimeEntries" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={checkInvoiceSequence} disabled={busy || !hasElectron}>Check Invoice Sequence</button>
										<InfoIcon infoKey="checkInvoiceSequence" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={validateSalesTotals} disabled={busy || !hasElectron}>Validate Sales Totals</button>
										<InfoIcon infoKey="validateSalesTotals" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={detectProductOrphans} disabled={busy || !hasElectron}>Detect Product Orphans</button>
										<InfoIcon infoKey="detectProductOrphans" />
									</div>
									<div className="flex items-center gap-2">
										<button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={detectLegacyScheduleEvents} disabled={busy || !hasElectron}>Detect Legacy Schedule Events</button>
										<InfoIcon infoKey="detectLegacyScheduleEvents" />
									</div>
							</div>
						</section>
						<section className="bg-zinc-950 border border-zinc-800 rounded p-3">
							<div className="text-sm font-semibold text-zinc-300 mb-2">Repair / Auto-fix</div>
							<div className="space-y-2">
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={autoFixCommonIssues} disabled={busy || !hasElectron}>Auto-fix Work Orders</button><InfoIcon infoKey="autoFixCommonIssues" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={autoFixTimeEntries} disabled={busy || !hasElectron}>Auto-fix Time Entries</button><InfoIcon infoKey="autoFixTimeEntries" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={normalizeCustomerPhones} disabled={busy || !hasElectron}>Normalize Customer Phones</button><InfoIcon infoKey="normalizeCustomerPhones" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={autoFixSalesTotals} disabled={busy || !hasElectron}>Auto-fix Sales Totals</button><InfoIcon infoKey="autoFixSalesTotals" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={auditTechPasscodes} disabled={busy || !hasElectron}>Audit Tech Passcodes</button><InfoIcon infoKey="auditTechPasscodes" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={autoFixTechPasscodes} disabled={busy || !hasElectron}>Auto-fix Tech Passcodes</button><InfoIcon infoKey="autoFixTechPasscodes" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={listUnclosedShifts} disabled={busy || !hasElectron}>List Unclosed Shifts</button><InfoIcon infoKey="listUnclosedShifts" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={clockOutAllOpenShifts} disabled={busy || !hasElectron}>Clock Out All Open Shifts</button><InfoIcon infoKey="clockOutAllOpenShifts" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={purgeLegacyScheduleEvents} disabled={busy || !hasElectron}>Purge Legacy Schedule Events</button><InfoIcon infoKey="purgeLegacyScheduleEvents" /></div>
							</div>
						</section>
						<section className="bg-zinc-950 border border-zinc-800 rounded p-3">
							<div className="text-sm font-semibold text-zinc-300 mb-2">Utilities</div>
							<div className="space-y-2">
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={openUserDataFolder} disabled={busy || !hasElectron}>Open User Data Folder</button><InfoIcon infoKey="openUserDataFolder" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={environmentInfo} disabled={busy || !hasElectron}>Environment Info</button><InfoIcon infoKey="environmentInfo" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={openAllDevTools} disabled={!hasElectron}>Open All DevTools</button><InfoIcon infoKey="openAllDevTools" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14] disabled:opacity-50" onClick={dbStats} disabled={busy || !hasElectron}>DB Stats</button><InfoIcon infoKey="dbStats" /></div>
									<div className="flex items-center gap-2"><button className="flex-1 text-left px-3 py-2 bg-red-900/50 border border-red-700 text-red-200 rounded hover:border-red-500 disabled:opacity-50" onClick={() => (window as any).api?.openClearDatabase ? (window as any).api.openClearDatabase() : window.open(window.location.origin + '/?clearDb=true', '_blank', 'noopener,noreferrer')} disabled={busy}>Clear Database…</button><InfoIcon infoKey="clearDatabase" /></div>
							</div>
						</section>
					</aside>
							{/* Main log view (larger, fixed; page not scrollable except sidebar) */}
							<main className="flex-1 min-w-0 flex flex-col">
											<div className="flex items-center justify-between mb-2">
												<div className="text-sm text-zinc-400">Log</div>
												<div className="flex items-center gap-2">
													<label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none"><input type="checkbox" className="accent-[#39FF14]" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} /> Auto-scroll</label>
													<button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={exportLog}>Export</button>
													<button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={clearLog}>Clear</button>
												</div>
											</div>
											<div className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-2 space-y-1 overflow-hidden">
												<div ref={logScrollRef} className="h-full overflow-auto">
							{logs.map((l, idx) => (
								<div key={idx} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-300' : 'text-zinc-300'}>
									[{l.ts}] {l.level.toUpperCase()}: {l.message}
								</div>
							))}
									</div>
								</div>

										{/* Info modal */}
										{info && (
											<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setInfo(null)}>
												<div className="w-[500px] max-w-[95vw] bg-zinc-900 border border-zinc-700 rounded p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
													<div className="flex items-center justify-between mb-2">
														<div className="font-semibold text-zinc-200">{info.title}</div>
														<button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]" onClick={() => setInfo(null)}>Close</button>
													</div>
													<div className="text-sm text-zinc-300 whitespace-pre-wrap">{info.body}</div>
												</div>
											</div>
										)}
						<div className="mt-2 text-xs text-zinc-500">High-ROI actions only; all writes are gated elsewhere.</div>
					</main>
				</div>
			</div>
		);
};

export default DevMenuWindow;
