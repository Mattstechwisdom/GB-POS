# GadgetBoy POS - AI Instructions

This workspace contains a minimal desktop POS application for a tech repair shop built with **Electron + Vite + React + TypeScript + Tailwind CSS**.

## Project Architecture

### Core Stack
- **Electron**: Main process (`app/electron/electron-main.ts`) and preload bridge (`app/electron/preload.ts`)
- **React + TypeScript**: UI components in `src/components/` and feature modules
- **Vite**: Development server and build tool
- **Tailwind CSS**: Styling with dark theme and neon-green (#39FF14) accents
- **JSON Database**: Local persistence at `app.getPath('userData')/gbpos-db.json`

### Key Patterns

#### 1. Child Window Architecture
Child windows are created via IPC handlers in `electron-main.ts`:
- `open-new-workorder` → 1400×900 New Work Order window
- `open-device-categories` → 900×600 Device Categories admin
- `open-repair-categories` → 900×600 Repair Categories window

Each child window loads the same React app with query parameters for routing (`?newWorkOrder=payload`, `?deviceCategories=true`, etc.).

#### 2. Preload API Bridge
The `preload.ts` exposes a consistent API pattern via `contextBridge`:
```typescript
window.api = {
  // Collection operations
  dbGet: (key: string) => Promise<any[]>
  dbAdd: (key: string, item: any) => Promise<any>
  dbUpdate: (key: string, id: any, item: any) => Promise<any>
  dbDelete: (key: string, id: number) => Promise<boolean>
  
  // Window operations
  openNewWorkOrder: (payload: any) => Promise<any>
  openDeviceCategories: () => Promise<any>
  openRepairCategories: () => Promise<any>
}
```

#### 3. React Component Patterns
- **Window Components**: Named `*Window.tsx` for child window content
- **Form Components**: Use async functions with `window.api` calls
- **Data Loading**: Components use `useEffect` with async API calls
- **Error Handling**: Global error boundaries in `main.tsx`

#### 4. Database Collections
Current collections in JSON DB:
- `customers` - Customer records
- `workOrders` - Work order records
- `technicians` - Technician list for admin
- `deviceCategories` - Product categories for admin

### Development Rules

#### File Organization
- Place child window content in `src/components/*Window.tsx`
- Feature modules go in `src/feature-name/` directories
- Shared utilities in `src/lib/`
- IPC handlers in `app/electron/electron-main.ts`
- API extensions in `app/electron/preload.ts`

#### Child Window Implementation
1. Add IPC handler in `electron-main.ts`:
   ```typescript
   ipcMain.handle('open-feature-name', async (_event: any) => {
     const child = new BrowserWindow({
       width: 900, height: 600,
       parent: BrowserWindow.getAllWindows()[0] || undefined,
       backgroundColor: '#18181b',
       // ... standard config
     });
   });
   ```

2. Add preload API method:
   ```typescript
   openFeatureName: (): Promise<any> => ipcRenderer.invoke('open-feature-name')
   ```

3. Add routing in `src/main.tsx`:
   ```typescript
   const showFeatureName = params.get('featureName');
   if (showFeatureName) {
     root.render(<FeatureNameWindow />);
     return;
   }
   ```

#### Styling Guidelines
- Use Tailwind classes with dark theme: `bg-zinc-900`, `text-gray-100`
- Neon-green accents: `#39FF14` for highlights and active states
- Form inputs: `bg-zinc-800` standard, `bg-yellow-200 text-black` for cost fields
- Consistent spacing: `p-4`, `gap-4`, `space-y-4`

#### Data Persistence
- All data persists to JSON collections via IPC
- Use incremental IDs: auto-assigned if `item.id` is missing
- Async operations: Always handle Promise responses
- Form validation: Check required fields before API calls

### Current Feature Status
- ✅ Main POS interface with work orders and customers
- ✅ New Work Order child window with totals computation
- ✅ Device Categories admin with CRUD operations  
- ✅ Technicians admin with JSON persistence
- ✅ JSON database with IPC bridge
- 🔄 Repair Categories window (in progress)

### Common Tasks

#### Adding New Admin Feature
1. Create `*Window.tsx` component with form and table
2. Add IPC handler for window creation
3. Extend preload API with collection methods
4. Add routing logic in `main.tsx`
5. Connect UI controls to async API calls

#### Debugging Child Windows
- Dev tools auto-open in development mode
- Check `dist-main/` for compiled Electron code
- Use error boundaries for React error catching
- IPC errors appear in main process terminal

### Build & Development
- `npm run dev` - Development mode with hot reload
- `npm run build` - Build React app to `dist/`
- `npm run dist` - Package as Windows .exe installer
- TypeScript compiles to `dist-main/` for Electron main process

