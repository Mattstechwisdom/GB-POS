export function getSuggestedSpecs(brand?: string, model?: string): string[] {
  const key = `${(brand||'').toLowerCase()}|${(model||'').toLowerCase()}`;
  const map: Record<string, string[]> = {
    'apple|iphone 11': ['6.1" Liquid Retina HD', 'A13 Bionic', '4 GB RAM', 'Dual 12MP Cameras', '3110 mAh Battery'],
    'apple|iphone 12': ['6.1" Super Retina XDR', 'A14 Bionic', '4 GB RAM', 'Dual 12MP Cameras', '2815 mAh Battery'],
    'apple|iphone 13': ['6.1" Super Retina XDR', 'A15 Bionic', '4 GB RAM', 'Dual 12MP Cameras', '3240 mAh Battery'],
    'samsung|galaxy s21': ['6.2" Dynamic AMOLED 120Hz', 'Snapdragon 888 / Exynos 2100', '8 GB RAM', 'Triple Camera', '4000 mAh Battery'],
    'google|pixel 6': ['6.4" AMOLED 90Hz', 'Google Tensor', '8 GB RAM', '50MP Main Camera', '4614 mAh Battery'],
    'apple|macbook air 13 (m1)': ['13.3" Retina', 'Apple M1', '8 GB Unified Memory', 'Up to 2 TB SSD', 'Fanless Design'],
  };
  return map[key] || [];
}

export function getSuggestedImage(brand?: string, model?: string): string | undefined {
  const key = `${(brand||'').toLowerCase()}|${(model||'').toLowerCase()}`;
  const map: Record<string, string> = {
    'apple|iphone 11': 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=60&auto=format',
    'apple|iphone 12': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=60&auto=format',
    'apple|iphone 13': 'https://images.unsplash.com/photo-1557180295-76eee20ae8aa?w=600&q=60&auto=format',
    'samsung|galaxy s21': 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600&q=60&auto=format',
    'google|pixel 6': 'https://images.unsplash.com/photo-1519558260268-cde7e03a0153?w=600&q=60&auto=format',
    'apple|macbook air 13 (m1)': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=60&auto=format'
  };
  return map[key];
}
