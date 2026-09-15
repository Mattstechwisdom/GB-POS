const assert = require('node:assert/strict');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const css = fs.readFileSync('src/styles/index.css', 'utf8') + fs.readFileSync('src/styles/desktop-nav-preview.css', 'utf8');
    const cell = `<div class="gb-calendar-cell"><div class="gb-calendar-cell-toolbar"><span>15 <button>S 2</button></span><span><button>Budget</button><button>+ Add</button></span></div><div class="gb-calendar-cell-events"><button>D</button><button>C</button><button>E</button></div><button class="gb-calendar-cell-events-compact">3 entries</button><div class="gb-calendar-day-actions"><button>Notes (3)</button><button>Tasks (2/5)</button></div></div>`;
    for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900]]) {
      win.setContentSize(width, height);
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>${css}</style><style>body{margin:0}.gb-calendar-window{display:flex;flex-direction:column}.gb-calendar-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr));height:calc(100vh - 180px);gap:6px}.gb-calendar-cell{display:flex;flex-direction:column;padding:8px}.gb-calendar-cell-toolbar{display:flex;justify-content:space-between}.gb-calendar-day-actions{display:grid;grid-template-columns:1fr 1fr;margin-top:auto}button{color:white;background:#27272a;border:1px solid #777;font-size:14px;padding:6px}</style><div class="gb-calendar-window"><div class="gb-calendar-month-grid">${cell.repeat(42)}</div></div>`));
      const clipped = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.gb-calendar-cell')).filter(cell=>Array.from(cell.querySelectorAll('button')).some(button=>{const a=cell.getBoundingClientRect(),b=button.getBoundingClientRect();return b.width>0&&(b.right>a.right+1||b.bottom>a.bottom+1||b.left<a.left-1)})).length`);
      if (clipped) console.error(await win.webContents.executeJavaScript(`Array.from(document.querySelector('.gb-calendar-cell').querySelectorAll('button')).map(b=>({text:b.textContent,height:b.getBoundingClientRect().height,top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom,cell:document.querySelector('.gb-calendar-cell').getBoundingClientRect().toJSON()}))`));
      assert.equal(clipped, 0, `Calendar controls must fit at ${width}×${height}`);
    }
    console.log('Desktop calendar fit checks passed.');
  } finally { win.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
