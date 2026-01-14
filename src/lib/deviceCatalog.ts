export type DeviceCatalog = Array<{
  category: 'Phone' | 'Laptop' | 'Tablet' | 'Accessory' | 'Other' | string;
  brands: Array<{
    name: string;
    models: string[];
  }>;
}>;

export const deviceCatalog: DeviceCatalog = [
  {
    category: 'Phone',
    brands: [
      { name: 'Apple', models: ['iPhone SE (2nd Gen)', 'iPhone SE (3rd Gen)', 'iPhone 8', 'iPhone X', 'iPhone 11', 'iPhone 12', 'iPhone 12 mini', 'iPhone 13', 'iPhone 13 mini', 'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro'] },
      { name: 'Samsung', models: ['Galaxy S10', 'Galaxy S20', 'Galaxy S21', 'Galaxy S22', 'Galaxy S23'] },
      { name: 'Google', models: ['Pixel 4', 'Pixel 5', 'Pixel 6', 'Pixel 7'] },
      { name: 'OnePlus', models: ['7T', '8 Pro', '9 Pro', '10 Pro'] }
    ]
  },
  {
    category: 'Laptop',
    brands: [
      { name: 'Apple', models: ['MacBook 12', 'MacBook Air 13 (Intel)', 'MacBook Air 13 (M1)', 'MacBook Air 13 (M2)', 'MacBook Air 15 (M2)', 'MacBook Pro 13 (Intel)', 'MacBook Pro 13 (M1/M2)', 'MacBook Pro 14 (M1 Pro/M2 Pro)', 'MacBook Pro 16 (M1 Pro/M2 Pro)'] },
      { name: 'Dell', models: ['XPS 13', 'XPS 15', 'Latitude 7420'] },
      { name: 'HP', models: ['Pavilion 15', 'Envy 13', 'Spectre x360'] },
      { name: 'Lenovo', models: ['ThinkPad X1 Carbon', 'Yoga 7i'] }
    ]
  },
  {
    category: 'Tablet',
    brands: [
      { name: 'Apple', models: ['iPad 7th Gen', 'iPad 8th Gen', 'iPad 9th Gen', 'iPad 10th Gen', 'iPad Air 4', 'iPad Air 5', 'iPad mini 6', 'iPad Pro 11 (M1/M2)', 'iPad Pro 12.9 (M1/M2)'] },
      { name: 'Samsung', models: ['Galaxy Tab S6', 'Galaxy Tab S7', 'Galaxy Tab S8'] },
      { name: 'Amazon', models: ['Fire HD 8', 'Fire HD 10'] }
    ]
  },
  {
    category: 'Audio',
    brands: [
      { name: 'Sony', models: ['WH-1000XM4', 'WH-1000XM5', 'WF-1000XM4'] },
      { name: 'Bose', models: ['QuietComfort 35 II', 'QuietComfort 45'] },
      { name: 'JBL', models: ['Flip 5', 'Charge 5'] },
      { name: 'Apple', models: ['AirPods (2nd Gen)', 'AirPods (3rd Gen)', 'AirPods Pro (1st Gen)', 'AirPods Pro (2nd Gen)', 'AirPods Max'] }
    ]
  },
  {
    category: 'Desktop',
    brands: [
      { name: 'Apple', models: ['iMac 21.5" (Intel)', 'iMac 27" (Intel)', 'iMac 24" (M1)', 'Mac mini (Intel)', 'Mac mini (M1)', 'Mac mini (M2)', 'Mac Studio (M1 Max/Ultra)', 'Mac Pro (Intel)'] }
    ]
  },
  {
    category: 'Watch',
    brands: [
      { name: 'Apple', models: ['Apple Watch Series 4', 'Apple Watch Series 5', 'Apple Watch Series 6', 'Apple Watch Series 7', 'Apple Watch Series 8', 'Apple Watch SE', 'Apple Watch Ultra'] }
    ]
  },
  {
    category: 'Console',
    brands: [
      { name: 'Sony', models: ['PlayStation 5', 'PlayStation 4'] },
      { name: 'Microsoft', models: ['Xbox Series X', 'Xbox Series S', 'Xbox One'] },
      { name: 'Nintendo', models: ['Switch', 'Switch OLED'] }
    ]
  },
  {
    category: 'Camera',
    brands: [
      { name: 'Canon', models: ['EOS R6', 'EOS R5', 'EOS M50'] },
      { name: 'Sony', models: ['Alpha a7 III', 'Alpha a7 IV', 'ZV-E10'] },
      { name: 'Nikon', models: ['Z6', 'Z7', 'D7500'] }
    ]
  },
  {
    category: 'Drone',
    brands: [
      { name: 'DJI', models: ['Mini 2', 'Mini 3 Pro', 'Air 2S', 'Mavic 3'] }
    ]
  },
  {
    category: 'Accessory',
    brands: [
      { name: 'Apple', models: ['AirPods', 'AirPods Pro'] },
      { name: 'Samsung', models: ['Galaxy Buds', 'Galaxy Buds Pro'] },
      { name: 'Anker', models: ['PowerCore 10000', 'Soundcore Liberty Air 2'] }
    ]
  }
];
