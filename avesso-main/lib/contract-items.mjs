export function isArtService(name) {
  return /\b(criativos?|artes?|design(?:er)?|carrosse?is?|carrossel|estatic[oa]s?)\b/.test(String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
}
export function normalizeContractItems(items) {
  const visible=items.filter(item=>!item.merged_into);
  const arts=visible.filter(item=>isArtService(item.name));
  if(!arts.length)return visible;
  const main=arts.find(item=>String(item.name).trim().toLowerCase()==='criativos')||arts[0];
  const counted=arts.some(item=>item.is_active)?arts.filter(item=>item.is_active):arts;
  const quantities=counted.filter(item=>item.monthly_quantity!==null&&item.monthly_quantity!==undefined&&item.monthly_quantity!=='');
  const prices=[...new Set(counted.filter(item=>item.extra_value!==null&&item.extra_value!==undefined&&item.extra_value!=='').map(item=>Number(item.extra_value)))];
  const grouped={...main,name:'Criativos',is_active:arts.some(item=>item.is_active),monthly_quantity:quantities.length?quantities.reduce((n,item)=>n+Number(item.monthly_quantity),0):null,extra_value:prices.length===1?prices[0]:null,_sourceIds:[...new Set(arts.flatMap(item=>item._sourceIds||[item.id]))],_isArts:true,_priceConflict:prices.length>1||arts.some(item=>item._priceConflict)};
  let inserted=false;
  return visible.flatMap(item=>{
    if(!isArtService(item.name))return [item];
    if(inserted)return [];inserted=true;return [grouped];
  });
}
