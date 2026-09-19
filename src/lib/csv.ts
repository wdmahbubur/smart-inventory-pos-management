import {decimalMoney} from './money';
export interface CsvColumn{key:string;label:string;kind?:'text'|'number'|'money'}
export function csvText(value:unknown):string{
 let text=value==null?'':String(value);
 let position=0;while(position<text.length&&(text.charCodeAt(position)<=32||/\s/u.test(text[position])))position++;
 if(['=','+','-','@'].includes(text[position]??'')||['\t','\r','\n'].includes(text[0]??''))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
function cell(value:unknown,kind:CsvColumn['kind']){if(value==null)return '';if(kind==='money')return decimalMoney(String(value));if(kind==='number'){const text=String(value);if(!/^-?\d+(?:\.\d+)?$/.test(text))throw new Error('Invalid numeric export field.');return text;}return csvText(value);}
export function serializeCsv(columns:CsvColumn[],rows:Record<string,unknown>[]):string{
 if(rows.length>100_000)throw new Error('Export exceeds 100,000 source rows.');
 return '\ufeff'+columns.map(c=>csvText(c.label)).join(',')+'\r\n'+rows.map(row=>columns.map(column=>cell(row[column.key],column.kind)).join(',')).join('\r\n')+'\r\n';
}
export const reportColumns:Record<string,CsvColumn[]>={
 sales:[{key:'sale_id',label:'Sale ID'},{key:'number',label:'Receipt number'},{key:'completed_at',label:'Completed at (UTC)'},{key:'product_id',label:'Product ID'},{key:'product_name_snapshot',label:'Product snapshot'},{key:'sku_snapshot',label:'SKU snapshot'},{key:'unit_snapshot',label:'Unit'},{key:'quantity',label:'Quantity',kind:'number'},{key:'unit_price_paisa',label:'Sold unit price (BDT)',kind:'money'},{key:'line_gross_paisa',label:'Line gross before discount (BDT)',kind:'money'},{key:'order_discount_paisa',label:'Order discount (BDT; first stable line only)',kind:'money'}],
 purchases:[{key:'purchase_id',label:'Purchase ID'},{key:'number',label:'Purchase number'},{key:'supplier_id',label:'Supplier ID'},{key:'supplier_name_snapshot',label:'Supplier snapshot'},{key:'received_at',label:'Received at (UTC)'},{key:'purchase_date',label:'Invoice date (Asia/Dhaka)'},{key:'product_id',label:'Product ID'},{key:'product_name_snapshot',label:'Product snapshot'},{key:'sku_snapshot',label:'SKU snapshot'},{key:'unit_snapshot',label:'Unit'},{key:'quantity',label:'Quantity',kind:'number'},{key:'unit_cost_paisa',label:'Actual unit cost (BDT)',kind:'money'},{key:'line_total_paisa',label:'Line total (BDT)',kind:'money'}],
 inventory:[{key:'id',label:'Product ID'},{key:'name',label:'Product'},{key:'sku',label:'SKU'},{key:'category_name',label:'Current category'},{key:'unit',label:'Unit'},{key:'quantity',label:'Available quantity',kind:'number'},{key:'minimum_stock',label:'Minimum quantity',kind:'number'},{key:'reference_cost_paisa',label:'Reference unit cost (BDT)',kind:'money'},{key:'stock_value_paisa',label:'Current estimated value (BDT)',kind:'money'},{key:'stock_status',label:'Status'}]
};
