import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvText,serializeCsv,streamCsv,reportColumns} from '../../src/lib/csv';
test('AT-47: CSV neutralizes formula-leading text while preserving numeric fields',()=>{for(const text of ['=1+1','+SUM(A1:A2)','-2+2','@cmd','  =evil','\t=evil'])assert.ok(csvText(text).startsWith('"\''));assert.equal(csvText('Milk, "fresh"\ncarton'),'"Milk, ""fresh""\ncarton"');const csv=serializeCsv([{key:'text',label:'Text'},{key:'delta',label:'Delta',kind:'number'},{key:'amount',label:'BDT',kind:'money'}],[{text:'=bad',delta:-2,amount:'7025'}]);assert.ok(csv.includes('"\'=bad",-2,70.25'));assert.ok(csv.startsWith('\ufeff'));});
test('sales export retains one discount and reconciled profit contribution',()=>{const csv=serializeCsv(reportColumns.sales,[{quantity:2,unit_price_paisa:'10000',line_gross_paisa:'20000',unit_cost_paisa:'7000',line_cost_paisa:'14000',line_profit_before_discount_paisa:'6000',order_discount_paisa:'2000',net_profit_contribution_paisa:'4000'},{quantity:3,unit_price_paisa:'5000',line_gross_paisa:'15000',unit_cost_paisa:'3000',line_cost_paisa:'9000',line_profit_before_discount_paisa:'6000',order_discount_paisa:null,net_profit_contribution_paisa:'6000'}]);const lines=csv.trimEnd().split('\r\n');assert.ok(lines[0].includes('Net profit contribution'));assert.ok(lines[1].endsWith(',60.00,20.00,40.00'));assert.ok(lines[2].endsWith(',60.00,,60.00'));});

test('CSV stream preserves UTF-8, snapshots, exact money and one discount per sale',async()=>{
 const rows=[{name:'দুধ, "fresh"',amount:'7025',discount:'20'},{name:'=SUM(A1)',amount:'10000',discount:null}];
 const columns=[{key:'snapshot_at',label:'Snapshot'},{key:'name',label:'Name'},{key:'amount',label:'BDT',kind:'money' as const},{key:'discount',label:'Discount',kind:'money' as const}];
 const snapshot='2026-09-18T04:35:00Z';
 const text=await new Response(streamCsv(columns,rows,{snapshot_at:snapshot})).text();
 assert.equal(text,serializeCsv(columns,rows.map(row=>({...row,snapshot_at:snapshot}))).slice(1));
});
test('CSV streams a response over 4.5 MB in bounded chunks without missing rows',async()=>{
 const rows=Array.from({length:50_000},(_,n)=>({n,name:'পণ্য '+String(n)+' '+ 'x'.repeat(100)}));
 const reader=streamCsv([{key:'n',label:'Number',kind:'number'},{key:'name',label:'Product'}],rows).getReader();
 let bytes=0,chunks=0,lines=0;
 for(;;){const {done,value}=await reader.read();if(done)break;assert.ok(value.byteLength<=64*1024);bytes+=value.byteLength;chunks++;for(const byte of value)if(byte===10)lines++;}
 assert.ok(bytes>4.5*1024*1024);assert.ok(chunks>1);assert.equal(lines,50_001);
});
test('CSV rejects 100001 rows before creating a response, and supports cancellation',async()=>{
 const columns=[{key:'n',label:'Number',kind:'number' as const}],tooMany=Array(100_001).fill({n:1});
 assert.throws(()=>serializeCsv(columns,tooMany),/Narrow the filters/);
 assert.throws(()=>streamCsv(columns,tooMany),/Narrow the filters/);
 const reader=streamCsv(columns,Array(100_000).fill({n:1})).getReader();await reader.read();await reader.cancel();assert.equal((await reader.read()).done,true);
});
