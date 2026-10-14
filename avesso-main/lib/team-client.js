import {fileApi} from './r2-client';
export const teamApi=(supabase,body)=>fileApi(supabase,body,'/api/team');
