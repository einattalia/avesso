import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api-fixture.mjs';

test('agency can create a project and its artwork',async()=>{
 const f=await fixture({routeName:'projects'});
 const p=await f.request({action:'create',clientId:'client',title:'Campanha de verão',description:'Nova campanha'});
 assert.equal(p.status,201);assert.equal(p.body.project.title,'Campanha de verão');
 const a=await f.request({action:'createArt',clientId:'client',projectId:p.body.project.id,title:'Post principal',type:'Criativo estático',briefing:'Texto do post',notes:'Interno'});
 assert.equal(a.status,201);assert.equal(a.body.art.project_id,p.body.project.id);
 assert.equal(f.tables.demands.at(-1).briefing,'Texto do post');
});

test('agency can edit project details and artwork text',async()=>{
 const f=await fixture({routeName:'projects'});
 f.tables.production_projects.push({id:'project',client_id:'client',organization_id:'org',title:'Antes',description:''});
 f.tables.demands[0].project_id='project';
 const project=await f.request({action:'update',clientId:'client',projectId:'project',title:'Depois',description:'Briefing geral'});
 const art=await f.request({action:'updateArt',clientId:'client',projectId:'project',demandId:'demand',title:'Nova arte',type:'Carrossel',briefing:'Texto atualizado'});
 assert.equal(project.body.project.title,'Depois');assert.equal(art.body.art.title,'Nova arte');
 assert.equal(f.tables.demands[0].briefing,'Texto atualizado');
});

test('clients cannot create or change production projects',async()=>{
 const f=await fixture({routeName:'projects',client:true});
 const r=await f.request({action:'create',clientId:'client',title:'Não permitido'});
 assert.equal(r.status,403);
});

test('deleting a project unlinks but preserves its artwork',async()=>{
 const f=await fixture({routeName:'projects'});
 f.tables.production_projects.push({id:'project',client_id:'client',organization_id:'org',title:'Projeto',archived_at:null});
 f.tables.demands[0].project_id='project';
 const r=await f.request({action:'delete',clientId:'client',projectId:'project'});
 assert.equal(r.status,200);assert.equal(f.tables.production_projects.length,0);
 assert.equal(f.tables.demands.length,1);assert.equal(f.tables.demands[0].project_id,null);
});

test('agency can move a legacy artwork to a project for the same client',async()=>{
 const f=await fixture({routeName:'projects'});
 f.tables.production_projects.push({id:'project',client_id:'client',organization_id:'org',title:'Projeto',archived_at:null});
 const r=await f.request({action:'moveArt',clientId:'client',projectId:'project',demandId:'demand'});
 assert.equal(r.status,200);assert.equal(f.tables.demands[0].project_id,'project');
});
