import {Insights} from '@/features/insights';
import {getInsight} from '@/lib/ai/service';
export default async function Page(){const {context,insight}=await getInsight('en');return <Insights initialContext={context} initialInsight={insight}/>}
