const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {orderedUndeliveredItemIndexes,productDeliveryFor}=require('../src/lib/productDelivery.ts');
const sale={id:90,items:[
 {description:'Phone Case',requiresOrder:true,orderStatus:'ordered',estimatedDeliveryDate:'2026-09-15'},
 {description:'Screen Protector',requiresOrder:true,orderStatus:'received'},
 {description:'Setup Labor',requiresOrder:true,labor:true,orderStatus:'ordered'},
 {description:'Diagnostic Fee',requiresOrder:true,feeType:'diagnostic',orderStatus:'ordered'},
]};
assert.deepEqual(orderedUndeliveredItemIndexes(sale),[0],'Only undelivered ordered products or parts may enter Product Delivery.');
assert.deepEqual(productDeliveryFor(sale),{itemIndexes:[0],itemCount:1,itemNames:['Phone Case'],items:[{index:0,name:'Phone Case',eta:'2026-09-15'}],eta:'2026-09-15'});
assert.deepEqual(orderedUndeliveredItemIndexes({items:[{description:'Cable',requiresOrder:true,orderStatus:'delivered'}]}),[],'Delivered products must leave Product Delivery immediately.');
console.log('Product delivery projection checks passed.');
