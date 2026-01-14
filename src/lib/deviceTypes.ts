export type DeviceField = {
  key: string;
  label: string;
  type: 'select' | 'text';
  options?: string[];
};

export type DeviceTypeDef = {
  type: string; // e.g., Phone, Laptop
  label: string;
  fields: DeviceField[];
};

export const deviceTypes: DeviceTypeDef[] = [
  {
    type: 'Apple Devices',
    label: 'Apple Devices',
    fields: [
      {
        key: 'device',
        label: 'Device',
        type: 'select',
        options: [
          // Device families only
          'iPhone',
          'iPad', 'iPad Air', 'iPad Pro', 'iPad mini',
          'MacBook', 'MacBook Air', 'MacBook Pro',
          'iMac', 'Mac mini', 'Mac Studio', 'Mac Pro',
          'Apple Watch',
          'AirPods', 'AirPods Pro', 'AirPods Max',
          'Apple TV', 'HomePod'
        ]
      },
      { key: 'storage', label: 'Storage', type: 'select', options: ['64 GB','128 GB','256 GB','512 GB','1 TB','2 TB'] },
      { key: 'color', label: 'Color', type: 'select', options: ['Black','White','Gray','Silver','Space Gray','Blue','Gold'] },
    ],
  },
  {
    type: 'Phone',
    label: 'Phone',
    fields: [
      { key: 'storage', label: 'Storage', type: 'select', options: ['16 GB','32 GB','64 GB','128 GB','256 GB','512 GB','1 TB'] },
      { key: 'carrier', label: 'Carrier', type: 'select', options: ['Unlocked','AT&T','T-Mobile','Verizon','Sprint','Boost','Metro','Xfinity','Other'] },
      { key: 'color', label: 'Color', type: 'select', options: ['Black','White','Gray','Silver','Blue','Red','Green','Purple','Gold'] },
      { key: 'os', label: 'OS', type: 'select', options: ['Android','iOS'] },
    ],
  },
  {
    type: 'Laptop',
    label: 'Laptop',
    fields: [
        { key: 'cpu', label: 'Processor', type: 'select', options: ['Intel i5','Intel i7','Intel i9','AMD Ryzen 5','AMD Ryzen 7','AMD Ryzen 9'] },
      { key: 'cpuGen', label: 'Processor Gen', type: 'text' },
        { key: 'ram', label: 'Memory', type: 'select', options: ['4 GB','8 GB','16 GB','32 GB','64 GB'] },
      { key: 'storage', label: 'Storage', type: 'select', options: ['64 GB','128 GB','256 GB','512 GB','1 TB','2 TB','4 TB'] },
      // General laptops typically don't need a dedicated GPU selector; keep this in Gaming Laptop only
      { key: 'screenSize', label: 'Screen Size', type: 'select', options: ['11.6"','12.5"','13.3"','14"','15.6"','16"','17.3"'] },
      { key: 'os', label: 'OS', type: 'select', options: ['Windows 10','Windows 11','macOS'] },
      { key: 'ports', label: 'Ports', type: 'text' },
      { key: 'accessories', label: 'Accessories', type: 'text' },
    ],
  },
  {
    type: 'Gaming Laptop',
    label: 'Gaming Laptop',
    fields: [
      // CPU group
      { key: 'cpu', label: 'Processor', type: 'select', options: ['Intel i5','Intel i7','Intel i9','Intel i3','Intel i5-11400','Intel i7-12700H','Intel i9-13900HX','AMD Ryzen 5','AMD Ryzen 7','AMD Ryzen 9','AMD Ryzen Threadripper','Other'] },
      { key: 'cpuGen', label: 'Processor Gen', type: 'text' },
      // Memory
      { key: 'ram', label: 'Memory', type: 'select', options: ['8 GB','16 GB','32 GB','64 GB','96 GB','128 GB'] },
      // GPU group
      { key: 'gpuBrand', label: 'Graphics Card Brand', type: 'select', options: ['NVIDIA','AMD','Intel','Integrated','Other'] },
      { key: 'gpuModel', label: 'Graphics Card Model', type: 'select', options: ['RTX 4090','RTX 4080','RTX 4070','RTX 4060','RTX 4050','RX 7900','RX 7800','RX 7700','Iris Xe','Other'] },
      { key: 'gpuVram', label: 'Graphics Card VRAM', type: 'select', options: ['4 GB','6 GB','8 GB','12 GB','16 GB','24 GB','48 GB','Other'] },
      // Storage group
      { key: 'bootDriveType', label: 'Boot Drive Type', type: 'select', options: ['HDD','SATA SSD','M.2 NVMe','NVMe (SATA)','eMMC','Integrated'] },
      { key: 'bootDriveStorage', label: 'Boot Drive Storage', type: 'select', options: ['128 GB','256 GB','512 GB','1 TB','2 TB','4 TB','8 TB'] },
      // Optional single secondary drive (controlled by UI checkbox)
      { key: 'secondaryStorage1Type', label: 'Secondary Drive Type', type: 'select', options: ['HDD','SATA SSD','M.2 NVMe','NVMe (SATA)','External','None'] },
      { key: 'secondaryStorage1Storage', label: 'Secondary Drive Storage', type: 'select', options: ['128 GB','256 GB','512 GB','1 TB','2 TB','4 TB','8 TB','None'] },
      // Display group
      { key: 'displaySize', label: 'Display Size', type: 'select', options: ['14"','15.6"','16"','17.3"','18"'] },
  { key: 'displayResolution', label: 'Display Resolution', type: 'select', options: ['1920×1080 (FHD)','2560×1440 (QHD)','2880×1620','3840×2160 (4K)'] },
  { key: 'refreshRate', label: 'Refresh Rate', type: 'select', options: ['60 Hz','120 Hz','144 Hz','165 Hz','240 Hz','360 Hz'] },
  // Cooling in its own section (show before keyboard and extras)
  { key: 'cooling', label: 'Cooling', type: 'select', options: ['Air Cooling','Liquid Cooling','Liquid Metal','Copper Heatsink','Dual Fan','Single Fan','Other'] },
      // Keyboard in its own section
      { key: 'keyboard', label: 'Keyboard', type: 'select', options: ['None','Membrane','Mechanical (Non-RGB)','Mechanical (RGB)','Single‑zone RGB','4‑zone RGB','Per‑key RGB','Optical Mechanical','Hot‑swappable','Other'] },
      // Software / OS in its own section (shown before extras)
      { key: 'os', label: 'OS', type: 'select', options: ['Windows 10','Windows 11','Linux','Other'] },
      // Extras: ports next to accessories (ports on the left)
      { key: 'ports', label: 'Ports', type: 'text' },
      { key: 'accessories', label: 'Accessories', type: 'text' },
    ],
  },

  // New device type for custom-built desktop PCs
  {
    type: 'Custom PC',
    label: 'Custom PC (Desktop)',
    fields: [
      // CPU and motherboard
      { key: 'cpu', label: 'Processor', type: 'select', options: ['Intel Core i3','Intel Core i5','Intel Core i7','Intel Core i9','AMD Ryzen 3','AMD Ryzen 5','AMD Ryzen 7','AMD Ryzen 9','AMD Threadripper','Other'] },
      { key: 'cpuGen', label: 'Processor Gen / Family', type: 'text' },
      { key: 'motherboard', label: 'Motherboard', type: 'text' },
      // Memory
      { key: 'ram', label: 'Memory', type: 'select', options: ['8 GB','16 GB','32 GB','64 GB','128 GB'] },
      { key: 'ramSpeed', label: 'Memory Speed', type: 'select', options: ['2133 MHz','2400 MHz','2666 MHz','3000 MHz','3200 MHz','3600 MHz','4000 MHz','Other'] },
      // GPU
      { key: 'gpuBrand', label: 'Graphics Card Brand', type: 'select', options: ['NVIDIA','AMD','Other'] },
      { key: 'gpuModel', label: 'Graphics Card Model', type: 'select', options: ['RTX 4090','RTX 4080','RTX 4070','RX 7900','RX 7800','Other'] },
      { key: 'gpuVram', label: 'Graphics Card VRAM', type: 'select', options: ['4 GB','6 GB','8 GB','12 GB','16 GB','24 GB'] },
      // Storage
      { key: 'bootDriveType', label: 'Boot Drive Type', type: 'select', options: ['HDD','SATA SSD','M.2 NVMe','NVMe (SATA)','Other'] },
      { key: 'bootDriveStorage', label: 'Boot Drive Storage', type: 'select', options: ['128 GB','256 GB','512 GB','1 TB','2 TB','4 TB','8 TB'] },
      { key: 'secondaryStorage1Type', label: 'Secondary Drive Type', type: 'select', options: ['HDD','SATA SSD','M.2 NVMe','External','Other','None'] },
      { key: 'secondaryStorage1Storage', label: 'Secondary Drive Storage', type: 'select', options: ['128 GB','256 GB','512 GB','1 TB','2 TB','4 TB','8 TB','None'] },
  // PSU / Case / Cooling
  { key: 'psu', label: 'PSU', type: 'text' },
  { key: 'case', label: 'Case', type: 'text' },
      { key: 'cooling', label: 'Cooling', type: 'select', options: ['Air Cooling','Liquid Cooling','Liquid Metal','Copper Heatsink','Dual Fan','Single Fan','Other'] },
      // OS should be a simple text field (no dropdown)
      { key: 'os', label: 'OS', type: 'text' },
      // Ports/Expansion removed per requirements; handled implicitly if needed in notes
      // Peripherals as a simple text field
      { key: 'peripherals', label: 'Peripherals', type: 'text' },
    ],
  },
  // New, dedicated quote form for per-part custom builds (special UI)
  {
    type: 'Custom Build',
    label: 'Custom Build (Per-Part)',
    // Fields are intentionally minimal because the renderer provides a custom UI for this type
    fields: [
      { key: 'buildNotes', label: 'Build Notes', type: 'text' },
      // OS should be a simple text field (no dropdown)
      { key: 'os', label: 'OS', type: 'text' },
    ],
  },
  {
    type: 'Audio',
    label: 'Audio',
    fields: [
      { key: 'audioType', label: 'Type', type: 'select', options: ['Headphones','Earbuds','Speaker'] },
      { key: 'color', label: 'Color', type: 'text' },
      { key: 'features', label: 'Features', type: 'text' },
    ],
  },
  {
    type: 'Tablet',
    label: 'Tablet',
    fields: [
      { key: 'size', label: 'Screen Size', type: 'select', options: ['7"','8"','10.2"','10.5"','11"','12.9"'] },
      { key: 'storage', label: 'Storage', type: 'select', options: ['32 GB','64 GB','128 GB','256 GB','512 GB','1 TB','2 TB'] },
      { key: 'connectivity', label: 'Connectivity', type: 'select', options: ['Wi‑Fi','Wi‑Fi + Cellular'] },
      { key: 'os', label: 'OS', type: 'select', options: ['iPadOS','Android','Windows'] },
      { key: 'color', label: 'Color', type: 'select', options: ['Black','White','Gray','Silver','Gold','Blue','Green'] },
    ],
  },
  {
    type: 'Console',
    label: 'Console',
    fields: [
      { key: 'model', label: 'Model', type: 'select', options: ['PS5','PS4','Xbox Series X','Xbox Series S','Xbox One','Nintendo Switch','Switch OLED'] },
      { key: 'storage', label: 'Storage', type: 'select', options: ['None','500 GB','1 TB','2 TB'] },
      { key: 'edition', label: 'Edition', type: 'select', options: ['Standard','Digital','Limited'] },
      { key: 'condition', label: 'Condition', type: 'select', options: ['New','Like New','Excellent','Good','Fair','Poor'] },
    ],
  },
  {
    type: 'Camera',
    label: 'Camera',
    fields: [
      { key: 'cameraType', label: 'Type', type: 'select', options: ['DSLR','Mirrorless','Point-and-shoot','Action'] },
      { key: 'sensor', label: 'Sensor', type: 'select', options: ['Full-frame','APS-C','Micro Four Thirds','1-inch'] },
      { key: 'mount', label: 'Lens Mount', type: 'select', options: ['Canon EF','Canon RF','Sony E','Nikon F','Nikon Z','MFT'] },
      { key: 'resolution', label: 'Resolution', type: 'select', options: ['12 MP','16 MP','20 MP','24 MP','32 MP','45 MP'] },
      { key: 'video', label: 'Video', type: 'select', options: ['1080p','4K','5.4K','8K'] },
      { key: 'accessories', label: 'Accessories', type: 'text' },
    ],
  },
  {
    type: 'Drone',
    label: 'Drone',
    fields: [
      { key: 'camera', label: 'Camera', type: 'select', options: ['12 MP / 4K','20 MP / 5.4K','4K Video','2.7K Video'] },
      { key: 'flightTime', label: 'Flight Time', type: 'select', options: ['20 min','30 min','40+ min'] },
      { key: 'range', label: 'Max Range', type: 'text' },
      { key: 'maxSpeed', label: 'Max Speed', type: 'text' },
      { key: 'weight', label: 'Weight', type: 'text' },
      { key: 'batteryCapacity', label: 'Battery Capacity', type: 'text' },
      { key: 'batteryCycles', label: 'Battery Cycles', type: 'text' },
      { key: 'batteriesIncluded', label: 'Batteries Included', type: 'text' },
      { key: 'controller', label: 'Controller', type: 'text' },
      { key: 'obstacleAvoidance', label: 'Obstacle Avoidance', type: 'text' },
      { key: 'gps', label: 'GPS', type: 'text' },
      { key: 'storage', label: 'Storage / Media', type: 'text' },
    ],
  },
];
