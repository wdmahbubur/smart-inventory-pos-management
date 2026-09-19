import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {readJsonRequest} from '@/lib/request-body';
import { AppError } from '@/lib/errors';
export const privateHeaders = { 'Cache-Control':'private, no-store, max-age=0', 'Vary':'Cookie' };
export function json(data:unknown,status=200) { return NextResponse.json(data,{status,headers:privateHeaders}); }
export function failure(error:unknown,requestId=crypto.randomUUID()) {
 if(error instanceof ZodError) return json({error:{code:'VALIDATION_ERROR',message:'Check your input.',fields:error.flatten().fieldErrors,uncertain:false},request_id:requestId},400);
 const e=error instanceof AppError?error:new AppError('TEMPORARY_FAILURE',undefined,true);
 console.warn(JSON.stringify({event:'request_rejected',request_id:requestId,code:e.code}));
 return json({error:{code:e.code,message:e.message,details:e.details,uncertain:e.uncertain},request_id:requestId},e.code==='UNAUTHENTICATED'?401:e.code==='NOT_FOUND'?404:e.uncertain?503:400);
}
export async function readBody(request:Request):Promise<unknown> {
 return readJsonRequest(request,new URL(process.env.APP_URL ?? request.url).origin);
}
