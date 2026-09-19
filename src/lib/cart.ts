import {z} from 'zod';
import type {Product} from './domain';
export const cartProductSchema=z.object({id:z.string().uuid(),name:z.string().max(150),sku:z.string().max(64),unit:z.enum(['piece','bottle','pack','carton','bag']),icon_key:z.enum(['package','bottle','bag','bread','milk','store']),color_key:z.enum(['emerald','amber','blue','rose','violet','sand']),selling_price_paisa:z.string().regex(/^\d{1,10}$/).refine(v=>BigInt(v)>0n&&BigInt(v)<=1_000_000_000n),version:z.number().int().positive(),quantity:z.number().int().min(0).max(1_000_000_000)});
export const cartSchema=z.object({lines:z.array(z.object({product:cartProductSchema,quantity:z.number().int().min(1).max(1_000_000)})).max(100).refine(lines=>new Set(lines.map(x=>x.product.id)).size===lines.length),discount:z.string().max(30),cash:z.string().max(30),customer_name:z.string().max(150),customer_phone:z.string().max(32)});
export type Cart=z.infer<typeof cartSchema>;
export type CartProduct=z.infer<typeof cartProductSchema>;
export const emptyCart:Cart={lines:[],discount:'0',cash:'',customer_name:'',customer_phone:''};
export function cartProduct(product:Product):CartProduct{return cartProductSchema.parse(product);}
export function addToCart(cart:Cart,product:Product):Cart {
 const line=cart.lines.find(x=>x.product.id===product.id);
 if(line)return {...cart,lines:cart.lines.map(x=>x.product.id===product.id?{...x,quantity:Math.min(1_000_000,x.quantity+1)}:x)};
 if(cart.lines.length>=100)throw new Error('A sale can contain at most 100 distinct products.');
 return {...cart,lines:[...cart.lines,{product:cartProduct(product),quantity:1}]};
}
