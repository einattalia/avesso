'use client';
import {useEffect,useState,useRef} from 'react';
import {signedProfileImage} from '../../lib/profile-media';

export function PrivateProfileImage({supabase,path,name,className='profileAvatar',fallbackClassName='profileAvatarFallback'}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let active=true;if(!path){setUrl('');return()=>{active=false}}signedProfileImage(supabase,path).then(value=>{if(active)setUrl(value)}).catch(()=>{if(active)setUrl('')});return()=>{active=false}},[supabase,path]);
 if(url)return <img className={className} src={url} alt={name?'Foto de '+name:'Foto de perfil'}/>;
 return <div className={fallbackClassName} aria-label={name||'Foto de perfil'}>{name?.trim()?.[0]?.toUpperCase()||'?'}</div>;
}

export function ProfileImageField({supabase,path,onFileChange,label='Foto ou logo',action}){
 const [file,setFile]=useState(null),[savedUrl,setSavedUrl]=useState(''),[fileUrl,setFileUrl]=useState(''),[zoom,setZoom]=useState(1),[position,setPosition]=useState({x:50,y:50}),[processing,setProcessing]=useState(false);
 const canvasRef=useRef(null),dragRef=useRef(null);
 useEffect(()=>{let active=true;if(!path){setSavedUrl('');return()=>{active=false}}signedProfileImage(supabase,path).then(url=>{if(active)setSavedUrl(url)}).catch(()=>{if(active)setSavedUrl('')});return()=>{active=false}},[supabase,path]);
 useEffect(()=>{if(!file){setFileUrl('');return}const url=URL.createObjectURL(file);setFileUrl(url);return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{
  if(!file||!fileUrl){if(!file){setProcessing(false);onFileChange(null)}return}
  let active=true;setProcessing(true);onFileChange(null);
  const image=new Image();
  image.onload=()=>{
   const canvas=canvasRef.current;if(!canvas){setProcessing(false);return}
   canvas.width=400;canvas.height=400;
   const context=canvas.getContext('2d');context.clearRect(0,0,400,400);
   const scale=Math.max(400/image.naturalWidth,400/image.naturalHeight)*zoom;
   const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
   const x=(400-width)*position.x/100,y=(400-height)*position.y/100;
   context.drawImage(image,x,y,width,height);
   canvas.toBlob(blob=>{if(active){setProcessing(false);if(blob)onFileChange(new File([blob],file.name,{type:blob.type||file.type||'image/png',lastModified:Date.now()}))}},file.type||'image/png',.92);
  };
  image.onerror=()=>{if(active){setProcessing(false);onFileChange(null)}};image.src=fileUrl;
  return()=>{active=false}
 },[file,fileUrl,zoom,position,onFileChange]);
 function startDrag(event){if(!fileUrl)return;event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={id:event.pointerId,x:event.clientX,y:event.clientY,position}}
 function moveDrag(event){const start=dragRef.current;if(!start||start.id!==event.pointerId)return;const rect=event.currentTarget.getBoundingClientRect();setPosition({x:Math.max(0,Math.min(100,start.position.x-(event.clientX-start.x)/rect.width*100)),y:Math.max(0,Math.min(100,start.position.y-(event.clientY-start.y)/rect.height*100))})}
 return <div className="profilePhotoField"><span>{label}</span><div className="profilePhotoControls">{file?<canvas ref={canvasRef} width="400" height="400" className="profilePhotoPreview profilePhotoPreviewCircle profilePhotoCropCanvas" aria-label="Prévia circular da foto. Arraste para ajustar." onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}/>:savedUrl?<img src={savedUrl} className="profilePhotoPreview profilePhotoPreviewCircle" alt="Foto circular atual"/>:<div className="profilePhotoPreview profilePhotoPreviewCircle profilePhotoPlaceholder">Sem foto</div>}<label className="secondary profilePhotoButton">Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const selected=event.target.files?.[0]||null;setFile(selected);setZoom(1);setPosition({x:50,y:50});setProcessing(Boolean(selected));onFileChange(null);event.target.value=''}}/></label>{action}</div>{file&&<div className="profilePhotoCropControls"><p>Arraste a imagem no círculo ou ajuste os controles:</p><label>Zoom <input type="range" min="1" max="3" step=".05" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><label>Horizontal <input type="range" min="0" max="100" value={position.x} onChange={event=>setPosition(current=>({...current,x:Number(event.target.value)}))}/></label><label>Vertical <input type="range" min="0" max="100" value={position.y} onChange={event=>setPosition(current=>({...current,y:Number(event.target.value)}))}/></label>{processing&&<small>Preparando recorte…</small>}</div>}<small>Use JPG, PNG ou WebP, com até 5 MB. A foto será recortada para caber na bolinha.</small></div>;
}
