import ClientPortal from '../../components/ClientPortal';
import {adminDb} from '../../../lib/r2-server';
import {hashClientPortalToken} from '../../../lib/client-portal-token';

export const dynamic='force-dynamic';
const baseMetadata={robots:{index:false,follow:false},referrer:'no-referrer'};
const defaultTitle='Portal do Cliente | Avesso';

export async function generateMetadata({params}){
  try{
    const {token}=await params;
    const tokenHash=hashClientPortalToken(token);
    const admin=adminDb();
    const {data:access,error:accessError}=await admin.from('client_portal_tokens').select('client_id,organization_id,revoked_at').eq('token_hash',tokenHash).maybeSingle();
    if(accessError||!access||access.revoked_at)return {...baseMetadata,title:defaultTitle};
    const {data:client,error:clientError}=await admin.from('clients').select('name').eq('id',access.client_id).eq('organization_id',access.organization_id).maybeSingle();
    if(clientError||!client?.name)return {...baseMetadata,title:defaultTitle};
    const title=`Portal do Cliente — ${client.name} | Avesso`;
    return {...baseMetadata,title,openGraph:{title,description:`Acesse as artes, aprovações, agendamentos e entregas de ${client.name} no portal Avesso.`,type:'website'}};
  }catch{
    return {...baseMetadata,title:defaultTitle};
  }
}

export default async function ClientPortalPage({params}){
  const {token}=await params;
  return <ClientPortal token={token}/>;
}
