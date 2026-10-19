const BUCKET='avesso-profile-images';
const TYPES={ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };

export async function uploadPrivateProfileImage(supabase,file,organizationId,kind,entityId='new'){
 if(!file)return null;
 if(!organizationId)throw new Error('Não foi possível identificar a organização.');
 if(!TYPES[file.type])throw new Error('Envie uma imagem JPG, PNG ou WebP.');
 if(file.size>5*1024*1024)throw new Error('A imagem deve ter até 5 MB.');
 const randomId=globalThis.crypto?.randomUUID?.()||(Date.now()+'-'+Math.random().toString(36).slice(2));
 const path=organizationId+'/'+kind+'/'+entityId+'/'+randomId+'.'+TYPES[file.type];
 const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw new Error(error.message||'Não foi possível enviar a imagem.');
 return path;
}

export async function signedProfileImage(supabase,path){
 if(!path)return '';
 const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);
 if(error)throw error;
 return data?.signedUrl||'';
}
