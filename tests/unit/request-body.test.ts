import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_REQUEST_BYTES,readJsonRequest} from '../../src/lib/request-body';
const origin='https://inventory.example';
function request(body:BodyInit,headers:Record<string,string>={}){
 return new Request(origin+'/api/mutate',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body,duplex:'half'} as RequestInit);
}
test('same-origin JSON uses a bounded streaming parser',async()=>{
 assert.deepEqual(await readJsonRequest(request('{"quantity":1}'),origin),{quantity:1});
 await assert.rejects(readJsonRequest(request('{}',{origin:'https://attacker.invalid'}),origin),/Check/);
 await assert.rejects(readJsonRequest(request('{}',{'content-type':'text/plain'}),origin),/Check/);
});
test('rejects a declared oversized request before consuming its body',async()=>{
 await assert.rejects(readJsonRequest(request('{}',{'content-length':String(MAX_REQUEST_BYTES+1)}),origin),/Check/);
});
test('rejects chunked oversized data without waiting for the rest of the stream',async()=>{
 let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(65536).fill(32));},cancel(){cancelled=true;}});
 await assert.rejects(readJsonRequest(request(stream),origin),/Check/);assert.equal(cancelled,true);
});
test('rejects malformed JSON and malformed UTF-8 rather than coercing input',async()=>{
 await assert.rejects(readJsonRequest(request('{'),origin),/Check/);
 await assert.rejects(readJsonRequest(request(new Uint8Array([0xff,0xfe])),origin),/Check/);
});
