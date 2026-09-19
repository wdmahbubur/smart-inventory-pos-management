import {money} from '@/lib/money';
import {Empty} from './ui';
export function ValueBars({rows,label}:{rows:{id:string;name:string;value:string}[];label:string}){
 if(!rows.length)return <Empty title="No posted values in this period" description="No chart values have been invented for this empty dataset."/>;
 const maximum=rows.reduce((max,row)=>BigInt(row.value)>max?BigInt(row.value):max,0n);
 return <div className="bars" role="list" aria-label={label}>{rows.map(row=><div className="bar-row" key={row.id} role="listitem"><span className="bar-label" title={row.name}>{row.name}</span><div className="bar-track" aria-hidden="true"><div className="bar-value" style={{width:`${maximum?Number(BigInt(row.value)*10_000n/maximum)/100:0}%`}}/></div><strong className="bar-amount">{money(row.value)}</strong></div>)}</div>;
}
export function StockDonut({inStock,low,out}:{inStock:number;low:number;out:number}){
 const total=inStock+low+out;if(!total)return <Empty title="No active products" description="Create products to see the stock-status distribution."/>;
 const radius=58,circumference=2*Math.PI*radius;let consumed=0;
 const segments=[{name:'In stock',count:inStock,color:'#3d9d78',className:''},{name:'Low stock',count:low,color:'#dcbb6d',className:'low'},{name:'Out of stock',count:out,color:'#d8847d',className:'out'}];
 return <div className="donut-wrap"><svg className="donut" viewBox="0 0 154 154" role="img" aria-label={`${total} active products: ${inStock} in stock, ${low} low stock, ${out} out of stock.`}>{segments.map(segment=>{const length=segment.count/total*circumference;const offset=consumed;consumed+=length;return <circle key={segment.name} cx="77" cy="77" r={radius} fill="none" stroke={segment.color} strokeWidth="19" strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-offset} transform="rotate(-90 77 77)"/>;})}<text x="77" y="78" textAnchor="middle">{total}</text><text className="subtitle" x="77" y="95" textAnchor="middle">products</text></svg><div className="legend">{segments.map(segment=><div className="legend-row" key={segment.name}><span className={`legend-dot ${segment.className}`}/><span>{segment.name}</span><strong>{segment.count}</strong></div>)}</div></div>;
}
