# Production Window Fidelity Design

## Goal

Preserve every existing GB POS workflow and production component while making the Command Center shell, embedded daughter windows, and responsive controls match the approved preview without cramped, confusing, or mock-only interfaces.

## Architecture

The production React components remain the only source of business behavior. `ModalShell` will identify the component it hosts and apply a component-specific viewport profile; it will not recreate Admin, repair, inventory, calendar, quote, technician, work-order, sale, or consultation screens. The preview remains a disposable visual fixture with sample data, while production buttons continue routing to existing IPC/modal handlers.

## Window Profiles

- Calendar uses a wide, near-viewport daughter panel with constrained toolbars and readable seven-column cells.
- Quote Generator, Inventory, Repairs, Reporting, and other dense tools use wide profiles.
- Notifications, Journal, Clock In/Out, and small utilities use compact profiles.
- Work orders, sales, consultations, and Admin tools retain their established separate-window behavior.
- At tablet and phone widths, controls wrap or stack without horizontal page overflow; calendar cells remain readable inside the window.
- At phone widths, All Invoices uses stacked record cards rather than a sideways-scrolling desktop table.

## Interaction Fidelity

Every main-shell action must route to an existing component or native window handler. The notification bell is the sole notification entry point. No generic preview list is permitted to replace a production component. Pop-out remains optional and uses the same production route.

## Verification

Automated checks cover every `API_TO_MODAL` route, all `ModalContent` cases, toolbar and drawer entry points, component-specific sizing profiles, Command Center counts, technician resolution, inventory hierarchy, and responsive calendar rules. Existing targeted feature suites and production builds must pass before release.
