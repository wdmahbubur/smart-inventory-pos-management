import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addToCart,cartSchema,emptyCart} from '../../src/lib/cart';
import type {Product} from '../../src/lib/domain';
const p={id:crypto.randomUUID(),name:'Coke 1L',sku:'DR-001',unit:'bottle',icon_key:'bottle',color_key:'rose',selling_price_paisa:'10000',version:1,quantity:30} as Product;
test('AT-26: selecting the same POS product combines one row',()=>{const cart=addToCart(addToCart(emptyCart,p),p);assert.equal(cart.lines.length,1);assert.equal(cart.lines[0].quantity,2);assert.equal(cart.lines[0].product.selling_price_paisa,'10000');});
test('cart storage validates shape and preserves expected price for explicit conflict review',()=>{const cart=addToCart(emptyCart,p);assert.equal(cartSchema.safeParse(cart).success,true);assert.equal(cartSchema.safeParse({...cart,lines:[...cart.lines,...cart.lines]}).success,false);const repriced={...p,selling_price_paisa:'12000',version:2};const result=addToCart(cart,repriced);assert.equal(result.lines[0].product.selling_price_paisa,'10000');assert.equal(result.lines[0].product.version,1);});
