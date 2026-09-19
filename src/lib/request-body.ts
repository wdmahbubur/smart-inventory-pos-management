import {AppError} from './errors';
export const MAX_REQUEST_BYTES=128*1024;
/** Bound bytes while reading, including chunked bodies with no Content-Length. */
export async function readJsonRequest(request:Request,expectedOrigin:string):Promise<unknown>{
 if(request.headers.get('origin')!==expectedOrigin)throw new AppError('VALIDATION_ERROR');
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError('VALIDATION_ERROR');
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_REQUEST_BYTES))throw new AppError('VALIDATION_ERROR');
 if(!request.body)throw new AppError('VALIDATION_ERROR');
 const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let bytes=0,text='';
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>MAX_REQUEST_BYTES){await reader.cancel();throw new AppError('VALIDATION_ERROR');}
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  return JSON.parse(text);
 }catch(error){
  if(error instanceof AppError)throw error;
  throw new AppError('VALIDATION_ERROR');
 }finally{reader.releaseLock();}
}
