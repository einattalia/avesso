import ClientPortalPage,{generateMetadata as portalMetadata} from '../page';

export const dynamic='force-dynamic';

export async function generateMetadata({params}){
  const {portalToken}=await params;
  return portalMetadata({params:{token:portalToken}});
}

export default async function NamedClientPortalPage({params}){
  const {portalToken}=await params;
  return <ClientPortalPage params={{token:portalToken}}/>;
}
