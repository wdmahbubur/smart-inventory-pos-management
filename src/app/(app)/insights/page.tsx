import {Insights} from '@/features/insights';
import {getInsight} from '@/lib/ai/service';
export default async function Page(){return <Insights initialData={await getInsight('en')}/>;}
