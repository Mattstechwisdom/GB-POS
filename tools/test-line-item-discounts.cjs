const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
function load(entry) { const out = esbuild.buildSync({ entryPoints:[path.join(process.cwd(), entry)], bundle:true, platform:'node', format:'cjs', write:false, external:['qrcode'] }); const shim={exports:{}}; new Function('module','exports','require',out.outputFiles[0].text)(shim,shim.exports,require); return shim.exports; }
const accounting = load('src/lib/ticketAccounting.ts');
assert.equal(accounting.discountedLineTotal({ units: 1, unitPrice: 100, discountType: 'percent', discountValue: 10 }), 90);
assert.equal(accounting.discountedLineTotal({ units: 1, unitPrice: 40, discountType: 'amount', discountValue: 90 }), 0);
const release = load('src/workorders/releasePrint.ts');
const workHtml = release.buildHtml({ invoiceId:'1',dateTimeISO:new Date().toISOString(),clientName:'Client',phone:'',email:'',device:'Phone',description:'Phone',model:'',serialNumber:'',password:'1234',patternSequence:[],problem:'Broken',items:[{description:'Repair',parts:40,labor:60,discountType:'percent',discountValue:10}],subTotalParts:36,subTotalLabor:54,discount:0,taxRate:8,taxes:2.88,amountPaid:0 });
assert.match(workHtml, /Line discount: -\$10\.00/); assert.match(workHtml, />36\.00</); assert.match(workHtml, />54\.00</);
const salePrint = load('src/sales/salePrint.ts');
const saleHtml = salePrint.buildSaleHtml({invoiceId:'2',dateTimeISO:new Date().toISOString(),clientName:'Client',phone:'',email:'',items:[{description:'Item',qty:1,price:100,discountType:'percent',discountValue:10}],subTotal:90,discount:0,taxRate:8,taxes:7.2,amountPaid:0});
assert.match(saleHtml, /Line discount: -\$10\.00/); assert.match(saleHtml, /\$90\.00/);
console.log('Line-item discount totals and print checks passed.');
