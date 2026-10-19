import ClientPortal from '../../components/ClientPortal';

export const dynamic='force-dynamic';
export const metadata={title:'Portal do cliente | Avesso',robots:{index:false,follow:false},referrer:'no-referrer'};

export default async function ClientPortalPage({params}){
  const {token}=await params;
  return <ClientPortal token={token}/>;
}
