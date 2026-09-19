import {z} from 'zod';
import {getInsight,generateInventoryInsight} from '@/lib/ai/service';
import {json,failure,readBody} from '@/lib/server/http';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){try{const language=z.enum(['bn','en']).parse(new URL(request.url).searchParams.get('language')??'bn');return json(await getInsight(language));}catch(error){return failure(error);}}
export async function POST(request:Request){try{const body=z.object({language:z.enum(['bn','en']),regenerate:z.boolean().default(false)}).strict().parse(await readBody(request));return json(await generateInventoryInsight(body.language,body.regenerate));}catch(error){return failure(error);}}
