const winAnsi = new Map([
  ['€',0x80],['‚',0x82],['ƒ',0x83],['„',0x84],['…',0x85],['†',0x86],['‡',0x87],['ˆ',0x88],['‰',0x89],['Š',0x8a],['‹',0x8b],['Œ',0x8c],['Ž',0x8e],['‘',0x91],['’',0x92],['“',0x93],['”',0x94],['•',0x95],['–',0x96],['—',0x97],['™',0x99],['š',0x9a],['›',0x9b],['œ',0x9c],['ž',0x9e],['Ÿ',0x9f]
]);
function pdfHex(value){
  return '<'+Array.from(String(value||'')).map(char=>{
    const code=winAnsi.has(char)?winAnsi.get(char):char.codePointAt(0);
    const byte=code>=32&&code<=255?code:63;
    return byte.toString(16).padStart(2,'0');
  }).join('')+'>';
}
function wrapParagraph(value,max=86){
  const words=String(value||'').split(/\s+/).filter(Boolean),lines=[];let line='';
  for(const word of words){
    if(!line){line=word;continue;}
    if((line+' '+word).length>max){lines.push(line);line=word}else line+=' '+word;
  }
  if(line)lines.push(line);
  return lines;
}
function safeFilename(value){return String(value||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'cliente'}
function formatMonth(month){
  const [year,number]=String(month||'').split('-');
  const date=new Date(Number(year),Number(number)-1,1,12);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(date).toLocaleUpperCase('pt-BR'):String(month||'').toLocaleUpperCase('pt-BR');
}
function statusLabel(status){return ({draft:'Rascunho',pending:'Aguardando opinião do cliente',approved:'Ideia aprovada',changes_requested:'Sugestão de ajuste'})[status]||'Planejado'}
function pdfText(x,y,size,value,bold=false,color='0.10 0.10 0.10'){
 return `BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm ${pdfHex(value)} Tj ET\n`;
}
function newPage(client,month,total,pageNumber){
 let s='q 0.06 0.06 0.06 rg 0 738 595 104 re f Q\nq 1 0.91 0 rg 0 738 9 104 re f Q\n';
 s+=pdfText(44,802,21,'AVESSO',true,'1 1 1');
 s+=pdfText(44,779,10,'PLANEJAMENTO MENSAL',false,'0.88 0.88 0.88');
 s+=pdfText(44,756,12,`${client} · ${month}`,true,'1 1 1');
 s+=pdfText(44,710,10,`Total: ${total} ${total===1?'ideia proposta':'ideias propostas'}`,true,'0.32 0.32 0.32');
 s+=`0.85 0.84 0.80 RG 44 695 m 551 695 l S\n`;
 return s;
}
export function buildMonthlyPlanPdf({clientName,month,items=[]}){
  const total=items.length,pages=[];
  let stream=newPage(clientName||'Cliente',formatMonth(month),total,1),y=674;
  const finish=()=>{stream+=`0.82 0.81 0.77 RG 44 34 m 551 34 l S\n`;stream+=pdfText(44,18,8,'AVESSO · PLANEJAMENTO DO CLIENTE',false,'0.48 0.47 0.44');pages.push(stream)};
  const start=()=>{stream=newPage(clientName||'Cliente',formatMonth(month),total,pages.length+1);y=674};
  for(let index=0;index<items.length;index++){
    const item=items[index],bodyLines=String(item.description||'').split(/\r?\n/).flatMap(line=>wrapParagraph(line,86));
    if(!bodyLines.length)bodyLines.push('Sem descrição.');
    let offset=0,first=true;
    while(offset<bodyLines.length){
      if(y<135){finish();start()}
      const room=Math.max(8,Math.floor((y-72)/13));
      const count=Math.min(bodyLines.length-offset,room,40);
      const chunk=bodyLines.slice(offset,offset+count);
      const details=[item.format||'Conteúdo',item.designerName?`Designer: ${item.designerName}`:'',item.videomakerName?`Videomaker: ${item.videomakerName}`:''].filter(Boolean);
      const cardHeight=47+chunk.length*13+(first?details.length*12:0);
      const top=y,bottom=y-cardHeight;
      stream+=`q 0.985 0.981 0.965 rg 44 ${bottom} 507 ${cardHeight} re f Q\n`;
      stream+=`q 0.87 0.82 0.35 RG 44 ${bottom} m 44 ${top} l S Q\n`;
      stream+=pdfText(58,top-18,11,`IDEIA ${String(index+1).padStart(2,'0')}`,true,'0.46 0.40 0.14');
      const heading=first?item.title||'Sem título':`${item.title||'Sem título'} (continuação)`;
      stream+=pdfText(58,top-35,12,heading,true);
      let lineY=top-56;
      if(first){for(const detail of details){stream+=pdfText(58,lineY,9,detail,false,'0.42 0.42 0.40');lineY-=12}}
      for(const line of chunk){stream+=pdfText(58,lineY,9,line,false,'0.25 0.25 0.24');lineY-=13}
      stream+=pdfText(442,top-18,8,statusLabel(item.status),false,'0.42 0.42 0.40');
      y=bottom-14;offset+=count;first=false;
    }
  }
  if(!items.length)stream+=pdfText(58,660,12,'Nenhuma ideia foi adicionada a este planejamento.');
  finish();
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const kids=[];
  let next=5;
  for(let i=0;i<pages.length;i++){kids.push(`${next} 0 R`);next+=2}
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  for(let i=0;i<pages.length;i++){
    const pageId=5+i*2,contentId=pageId+1,content=pages[i];
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${content.length} >>\nstream\n${content}endstream`;
  }
  let output='%PDF-1.4\n',offsets=[0];
  for(let id=1;id<objects.length;id++){offsets[id]=output.length;output+=`${id} 0 obj\n${objects[id]}\nendobj\n`}
  const xref=output.length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let id=1;id<objects.length;id++)output+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return output;
}
export function downloadMonthlyPlanPdf(plan){
  const contents=buildMonthlyPlanPdf(plan),url=URL.createObjectURL(new Blob([contents],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download=`planejamento-${safeFilename(plan.clientName)}-${plan.month}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
