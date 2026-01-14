const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// Dummy specs for demonstration
const universalSpecs = {
  phone: {
    "iPhone 15": {
      Processor: "A16 Bionic",
      Display: '6.1" Super Retina XDR OLED',
      "Main Camera": "48MP + 12MP Ultra Wide",
      Battery: "3349 mAh",
      OS: "iOS 17"
    }
  },
  laptop: {
    "ThinkPad X1 Carbon Gen 6": {
      Processor: "Intel Core i7-8650U",
      RAM: "16 GB",
      Storage: "512 GB NVMe SSD",
      Display: '14" FHD Touch',
      OS: "Windows 10 Pro"
    }
  }
};

app.post('/api/specs', (req, res) => {
  const { category, model } = req.body;
  const specs = universalSpecs[category]?.[model] || {};
  res.json(specs);
});

app.post('/api/images', async (req, res) => {
  const { model, exclude = [] } = req.body;
  const placeholderImages = {
    "iPhone 15": [
      "https://fdn2.gsmarena.com/vv/pics/apple/apple-iphone-15-1.jpg",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-model-unselect-gallery-1-202309?wid=512&hei=512&fmt=jpeg",
      "https://images.macrumors.com/t/0w0veQn5FJwJhtjhmQ9h6tiy_3Y=/1600x0/article-new/2023/09/iPhone-15-Colors-Feature.jpg"
    ],
    "ThinkPad X1 Carbon Gen 6": [
      "https://www.lenovo.com/medias/lenovo-laptop-thinkpad-x1-carbon-gen-6-subseries-hero.png",
      "https://m.media-amazon.com/images/I/81kU3sA1uRL._AC_SL1500_.jpg",
      "https://cdn1.smartprix.com/rx-iU8yP7y1U-w1200-h1200/lenovo-thinkpad-x1-c.jpg"
    ]
  };
  const images = (placeholderImages[model] || []).filter(url => !exclude.includes(url));
  res.json(images.slice(0, 3));
});

app.listen(5000, () => {
  console.log('Backend running on http://localhost:5000');
});