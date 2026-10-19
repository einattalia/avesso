'use client';
import {useEffect,useState} from 'react';
import {signedProfileImage} from '../../lib/profile-media';

export function PrivateProfileImage({supabase,path,name,className='profileAvatar',fallbackClassName='profileAvatarFallback'}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let active=true;if(!path){setUrl('');return()=>{active=false}}signedProfileImage(supabase,path).then(value=>{if(active)setUrl(value)}).catch(()=>{if(active)setUrl('')});return()=>{active=false}},[supabase,path]);
 if(url)return <img className={className} src={url} alt={name?'Foto de '+name:'Foto de perfil'}/>;
 return <div className={fallbackClassName} aria-label={name||'Foto de perfil'}>{name?.trim()?.[0]?.toUpperCase()||'?'}</div>;
}

export function ProfileImageField({supabase,path,onFileChange,label='Foto ou logo'}){
 const [file,setFile]=useState(null),[savedUrl,setSavedUrl]=useState('');
 useEffect(()=>{let active=true;if(!path){setSavedUrl('');return()=>{active=false}}signedProfileImage(supabase,path).then(url=>{if(active)setSavedUrl(url)}).catch(()=>{if(active)setSavedUrl('')});return()=>{active=false}},[supabase,path]);
 const [preview,setPreview]=useState('');
 useEffect(()=>{if(!file){setPreview(savedUrl);return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file,savedUrl]);
 return <div className="profilePhotoField"><span>{label}</span><div className="profilePhotoControls">{preview?<img src={preview} className="profilePhotoPreview" alt="Prévia da imagem selecionada"/>:<div className="profilePhotoPreview profilePhotoPlaceholder">Sem foto</div>}<label className="secondary profilePhotoButton">Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const selected=event.target.files?.[0]||null;setFile(selected);onFileChange(selected);event.target.value=''}}/></label></div><small>JPG, PNG ou WebP, até 5 MB. As imagens ficam privadas no espaço da agência.</small></div>;
}
