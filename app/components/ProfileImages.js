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
 const [file,setFile]=useState(null),[savedUrl,setSavedUrl]=useState(''),[fileUrl,setFileUrl]=useState(''),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0});
 const canvasRef=useRef(null),dragRef=useRef(null);
 useEffect(()=>{let active=true;if(!path){setSavedUrl('');return()=>{active=false}}signedProfileImage(supabase,path).then(url=>{if(active)setSavedUrl(url)}).catch(()=>{if(active)setSavedUrl('')});return()=>{active=false}},[supabase,path]);
 useEffect(()=>{if(!file){setFileUrl('');return}const url=URL.createObjectURL(file);setFileUrl(url);return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{
  if(!file||!fileUrl){if(!file)onFileChange(null);return}
  let active=true;const image=new Image();image.onload=()=>{
   const canvas=canvasRef.current;if(!canvas)return;canvas.width=400;canvas.height=400;
   const context=canvas.getContext('2d');context.clearRect(0,0,400,400);
   const scale=Math.max(400/image.naturalWidth,400/image.naturalHeight)*zoom;
   const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
   const x=(400-width)*(offset.x+100)/200,y=(400-height)*(offset.y+100)/200;
   context.drawImage(image,x,y,width,height);
   canvas.toBlob(blob=>{if(active&&blob)onFileChange(new File([blob],file.name,{type:blob.type||file.type||'image/png',lastModified:Date.now()}))},file.type||'image/png',.92);
  };image.onerror=()=>{if(active)onFileChange(null)};image.src=fileUrl;return()=>{active=false}
 },[file,fileUrl,zoom,offset,onFileChange]);
 function startDrag(event){if(!fileUrl)return;event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset}}
 function moveDrag(event){const start=dragRef.current;if(!start||start.id!==event.pointerId)return;const rect=event.currentTarget.getBoundingClientRect();setOffset({x:Math.max(-100,Math.min(100,start.offset.x-(event.clientX-start.x)/rect.width*200)),y:Math.max(-100,Math.min(100,start.offset.y-(event.clientY-start.y)/rect.height*200))})}
 return <div className="profilePhotoField"><span>{label}</span><div className="profilePhotoControls">{file?<canvas ref={canvasRef} width="400" height="400" className="profilePhotoPreview profilePhotoPreviewCircle profilePhotoCropCanvas" aria-label="Ajuste a foto dentro do círculo" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}/>:savedUrl?<img src={savedUrl} className="profilePhotoPreview profilePhotoPreviewCircle" alt="Foto circular atual"/>:<div className="profilePhotoPreview profilePhotoPreviewCircle profilePhotoPlaceholder">Sem foto</div>}<label className="secondary profilePhotoButton">Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const selected=event.target.files?.[0]||null;setFile(selected);setZoom(1);setOffset({x:0,y:0});onFileChange(null);event.target.value=''}}/></label>{action}</div>{file&&<div className="profilePhotoCropControls"><label>Zoom <input type="range" min="1" max="3" step=".05" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><small>Arraste a foto dentro do círculo para ajustar o enquadramento.</small></div>}<small>Use JPG, PNG ou WebP, com até 5 MB. A foto será recortada para caber na bolinha.</small></div>;
}
