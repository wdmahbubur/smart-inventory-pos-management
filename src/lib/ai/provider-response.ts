import {AppError} from '../errors';
/** Bound provider response memory independently from the model token limit. */
export async function readProviderJson(response:Response):Promise<unknown>{
 const limit=128*1024;
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new AppError('AI_INVALID_OUTPUT',{reason:'provider_declared_response_size'});}
 if(!response.body)throw new AppError('AI_INVALID_OUTPUT',{reason:'provider_body_missing'});
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,text='';
 try{
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw new AppError('AI_INVALID_OUTPUT',{reason:'provider_response_size'});}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
  return JSON.parse(text);
 }catch(error){if(error instanceof AppError)throw error;throw new AppError('AI_INVALID_OUTPUT',{reason:error instanceof SyntaxError?'provider_response_json':'provider_response_read'});}
 finally{reader.releaseLock();}
}
export function providerMetadata(value:unknown,max:number):string|null{
 return typeof value==='string'&&value.length>0&&value.length<=max&&!/[<>]/.test(value)&&![...value].some(c=>c.charCodeAt(0)<32)?value:null;
}
