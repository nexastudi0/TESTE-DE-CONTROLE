/**
 * NEXA VET CONTROL · Edge Function Deno/Supabase.
 * Permissões verificadas no servidor. Nunca exportar service_role ao navegador.
 * Implantação: supabase functions deploy nexa-api
 * Secrets: NEXA_PIN_PEPPER (32+ caracteres aleatórios), valores padrão do Supabase.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const PEPPER = Deno.env.get('NEXA_PIN_PEPPER') || '';
const db = createClient(URL, SERVICE, {auth:{autoRefreshToken:false,persistSession:false}});
const answer = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const fail = (message:string,status=400)=>answer({error:message},status);
const must=(test:unknown,msg:string)=>{if(!test)throw Error(msg)};
const administrator=(profile:any)=>must(['owner','finance'].includes(profile.role),'Operação restrita à proprietária e ao administrativo.');
const text=(v:any,max=500)=>String(v??'').trim().slice(0,max);
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword=(value:string)=>value.length>=8&&value.length<=128;
const validPin=(value:string)=>/^\d{6}$/.test(value);
const validRate=(n:number)=>Number.isFinite(n)&&n>=.01&&n<=100000;
const parseCnpj=(v:any)=>{const str=text(v,20).toUpperCase().replace(/[.\/\-\s]/g,'');must(!str||(/^[A-Z0-9]{12}[0-9]{2}$/.test(str)),'CNPJ deve ter 14 caracteres válidos (com os dois dígitos verificadores numéricos).');return str||null};
const safe=(v:any)=>{if(!v)throw Error('Valor obrigatório.');return v};
const permitted=(profile:any)=>({id:profile.id,name:profile.full_name,email:profile.email,role:profile.role,active:profile.is_active,must_change_password:profile.must_change_password,...(['owner','finance'].includes(profile.role)?{}:{})});
const workerPublic=(w:any)=>({id:w.id,name:w.full_name,email:w.email,role:w.role,rate:w.hourly_rate,pj_legal_name:w.pj_legal_name,pj_cnpj:w.pj_cnpj,active:w.is_active,must_change_password:w.must_change_password});
const adminPublic=(w:any)=>({id:w.id,name:w.full_name,email:w.email,role:w.role,active:w.is_active});
const isPostgresError=(res:any)=>{if(res.error)throw Error(res.error.message||'Erro no banco de dados');return res.data};
const getOne=async(table:string,column:string,value:any)=>isPostgresError(await db.from(table).select('*').eq(column,value).single());
async function pinHash(pin:string){must(PEPPER.length>=32,'Defina a variável secreta NEXA_PIN_PEPPER (mínimo 32 caracteres).');const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);const out=await crypto.subtle.sign('HMAC',key,enc.encode(pin));return Array.from(new Uint8Array(out),x=>x.toString(16).padStart(2,'0')).join('')}
async function log(profile:any,action:string,description:string,metadata:Record<string,unknown>={}){
 const row={actor_id:profile.id,actor_name:profile.full_name,action,description,metadata};
 isPostgresError(await db.from('audit_logs').insert(row));
}
function dateValid(s:any){if(typeof s!=='string')return null;const d=new Date(s);return Number.isFinite(d.valueOf())?d:null}
async function fetchAll(table:string,column:string,operator:'eq'|'none'='none',value?:string,sort='created_at'){
 let all:any[]=[];let from=0;while(from<10000){let q=db.from(table).select('*').order(sort,{ascending:false}).range(from,from+999);if(operator==='eq')q=q.eq(column,value!);const part=isPostgresError(await q);all=all.concat(part);if(part.length<1000)break;from+=1000}return all;
}
async function credentials(p:any,body:any){
 const name=text(body.name,100),email=text(body.email,200).toLowerCase(),password=String(body.password||'');
 must(name.length>=2,'Informe o nome completo.');must(validEmail(email),'E-mail inválido.');must(validPassword(password),'Senha deve ter entre 8 e 128 caracteres.');
 return {name,email,password};
}
async function createAccount(actor:any,body:any,role:string){
 const cred=await credentials(actor,body);
 const pjCnpj=role==='worker'?parseCnpj(body.pj_cnpj):null;const pjLegalName=role==='worker'?(text(body.pj_legal_name,150)||null):null;
 let rate:number|null=null,hash:string|null=null;
 if(role==='worker'){const pin=String(body.pin||'');rate=Number(body.rate);must(validPin(pin),'PIN deve ter seis números.');must(validRate(rate),'Valor por hora inválido.');hash=await pinHash(pin);const matches=isPostgresError(await db.from('profiles').select('id').eq('pin_hash',hash).limit(1));must(matches.length===0,'PIN em uso por outro profissional.');}
 const authCreated=await db.auth.admin.createUser({email:cred.email,password:cred.password,email_confirm:true});
 if(authCreated.error||!authCreated.data.user)throw Error(authCreated.error?.message||'Falha ao criar acesso.');
 const id=authCreated.data.user.id;
 try{
  isPostgresError(await db.from('profiles').insert({id,full_name:cred.name,email:cred.email,role,hourly_rate:rate,pin_hash:hash,pj_cnpj:pjCnpj,pj_legal_name:pjLegalName,must_change_password:role!=='kiosk'}));
  if(role==='worker')isPostgresError(await db.from('worker_rate_history').insert({worker_id:id,hourly_rate:rate,changed_by:actor.id}));
 }catch(e){await db.auth.admin.deleteUser(id);throw e}
 await log(actor,role==='worker'?'create_employee':role==='kiosk'?'create_kiosk':'create_admin',`Acesso ${role==='worker'?'profissional':role==='kiosk'?'de terminal':'administrativo'} criado: ${cred.name}`,{user_id:id});
 return {ok:true,id};
}
async function bootstrap(profile:any){
 const settings=getOne('clinic_settings','id',1);
 if(profile.role==='kiosk')return {user:permitted(profile),settings:await settings,workers:[],sessions:[],approvals:[],audit:[],requests:[],admins:[]};
 if(profile.role==='worker'){
  const sessions=fetchAll('work_sessions','worker_id','eq',profile.id,'started_at');
  const requests=fetchAll('correction_requests','worker_id','eq',profile.id);
  return {user:permitted(profile),settings:await settings,workers:[],sessions:await sessions,approvals:[],audit:[],requests:await requests,admins:[]};
 }
 administrator(profile);
 const [workers,sessions,approvals,requests,audit,admins,s] = await Promise.all([
  db.from('profiles').select('*').eq('role','worker').order('full_name'),
  fetchAll('work_sessions','','none',undefined,'started_at'),
  fetchAll('payment_approvals','','none',undefined,'approved_at'),
  fetchAll('correction_requests','','none'),
  db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(150),
  db.from('profiles').select('*').in('role',['owner','finance']).order('full_name'),
  settings
 ]);
 const w=isPostgresError(workers),a=isPostgresError(audit),adminsRes=isPostgresError(admins);
 return {user:permitted(profile),settings:s,workers:w.map(workerPublic),sessions,approvals,requests,audit:a,admins:adminsRes.map(adminPublic)};
}
async function updateWorker(profile:any,body:any){administrator(profile);const id=text(body.id,50),w=await getOne('profiles','id',id);must(w.role==='worker','Profissional não encontrado.');
 const update:any={updated_at:new Date().toISOString()};
 if(body.name!==undefined){update.full_name=text(body.name,100);must(update.full_name.length>=2,'Nome inválido.');}
 if(body.rate!==undefined){update.hourly_rate=Number(body.rate);must(validRate(update.hourly_rate),'Tarifa inválida.');}
 if(body.active!==undefined)update.is_active=body.active===true;
 if(body.pj_cnpj!==undefined)update.pj_cnpj=parseCnpj(body.pj_cnpj);
 if(body.pj_legal_name!==undefined)update.pj_legal_name=text(body.pj_legal_name,150)||null;
 if(body.pin){const pin=String(body.pin);must(validPin(pin),'O PIN deve ter seis dígitos.');update.pin_hash=await pinHash(pin);const existing=isPostgresError(await db.from('profiles').select('id').eq('pin_hash',update.pin_hash).neq('id',id).limit(1));must(existing.length===0,'PIN já utilizado.');}
 isPostgresError(await db.from('profiles').update(update).eq('id',id));
 if(update.hourly_rate!==undefined&&Number(update.hourly_rate)!==Number(w.hourly_rate))isPostgresError(await db.from('worker_rate_history').insert({worker_id:id,hourly_rate:update.hourly_rate,changed_by:profile.id}));
 await log(profile,'update_employee',`Cadastro do profissional ${w.full_name} atualizado`,{user_id:id});return {ok:true};
}
async function resetPassword(profile:any,body:any){administrator(profile);const w=await getOne('profiles','id',text(body.id));must(w.role==='worker','A senha somente pode ser redefinida para um profissional por esta ação.');const password=String(body.password||'');must(validPassword(password),'Senha provisória inválida.');const res=await db.auth.admin.updateUserById(w.id,{password});if(res.error)throw Error(res.error.message);isPostgresError(await db.from('profiles').update({must_change_password:true,updated_at:new Date().toISOString()}).eq('id',w.id));await log(profile,'reset_password',`Senha provisória criada para ${w.full_name}`,{user_id:w.id});return {ok:true}}
async function changePassword(profile:any,body:any){const authClient=createClient(URL, ANON, {auth:{autoRefreshToken:false,persistSession:false}});const old=String(body.current_password||''),next=String(body.new_password||'');must(validPassword(next),'A senha deve ter no mínimo 8 caracteres.');must(old!==next,'A nova senha precisa ser diferente.');
 const res=await authClient.auth.signInWithPassword({email:profile.email,password:old});must(!res.error,'A senha atual está incorreta.');
 const changed=await db.auth.admin.updateUserById(profile.id,{password:next});if(changed.error)throw Error(changed.error.message);
 isPostgresError(await db.from('profiles').update({must_change_password:false,updated_at:new Date().toISOString()}).eq('id',profile.id));
 await log(profile,'change_password','Senha pessoal alterada');await authClient.auth.signOut();return {ok:true};}
async function saveSettings(profile:any,body:any){administrator(profile);const name=text(body.company_name,120),day=Number(body.closing_day);must(name.length>=2,'Nome da clínica inválido.');must(Number.isInteger(day)&&day>=1&&day<=31,'Dia de fechamento inválido.');
 isPostgresError(await db.from('clinic_settings').update({company_name:name,closing_day:day,updated_at:new Date().toISOString(),updated_by:profile.id}).eq('id',1));await log(profile,'save_settings','Configurações gerais da clínica atualizadas');return {ok:true};}
function imageBytes(base64:any){must(typeof base64==='string'&&base64.startsWith('data:image/jpeg;base64,'),'É obrigatório tirar uma foto real pela câmera.');const source=base64.slice('data:image/jpeg;base64,'.length);must(source.length>=1000&&source.length<1_350_000,'Foto fora do tamanho permitido.');let data:Uint8Array;try{data=Uint8Array.from(atob(source),c=>c.charCodeAt(0))}catch(_){throw Error('Foto inválida.')}
 must(data.length<=1024*1024&&data[0]===255&&data[1]===216,'Envie uma fotografia JPEG válida.');return data;}
async function clock(profile:any,body:any,channel:'kiosk'|'worker'='kiosk'){must(profile.role===channel,'Você não tem permissão para registrar por este canal.');const pin=String(body.pin||'');must(validPin(pin),'PIN de seis dígitos obrigatório.');
 const since=new Date(Date.now()-15*60*1000).toISOString();const attempts=isPostgresError(await db.from('clock_attempts').select('id').eq('kiosk_id',profile.id).eq('success',false).gte('created_at',since).limit(10));
 must(attempts.length<5,'Muitas tentativas inválidas. Aguarde 15 minutos ou procure a administração.');
 const hash=await pinHash(pin);const match=isPostgresError(await db.from('profiles').select('*').eq('pin_hash',hash).eq('role','worker').eq('is_active',true).limit(1));
 if(!match.length||(channel==='worker'&&match[0].id!==profile.id)){await db.from('clock_attempts').insert({kiosk_id:profile.id,success:false});throw Error('PIN inválido ou profissional inativo.');}
 const person=match[0];const photo=imageBytes(body.photo_base64);
 const open=isPostgresError(await db.from('work_sessions').select('*').eq('worker_id',person.id).is('ended_at',null).limit(1));
 if(open.length&&Date.now()-new Date(open[0].started_at).valueOf()>36*3600*1000)throw Error('Registro anterior muito antigo. Solicite correção administrativa.');
 const now=new Date().toISOString(),path=`${person.id}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.jpg`;
 const storage=await db.storage.from('vet-clock-photos').upload(path,photo,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});if(storage.error)throw Error('Não foi possível guardar a fotografia. Tente novamente.');
 try{
  if(open.length){const s=open[0];isPostgresError(await db.from('work_sessions').update({ended_at:now,ended_photo_path:path,status:(channel==='worker'||s.status==='pending_review'||!s.terminal_id)?'pending_review':'automatic',updated_at:now}).eq('id',s.id));}
  else isPostgresError(await db.from('work_sessions').insert({worker_id:person.id,terminal_id:channel==='kiosk'?profile.id:null,started_at:now,started_photo_path:path,rate_snapshot:person.hourly_rate,status:'open',reason:channel==='worker'?'Registro via login pessoal; necessita conferência das câmeras.':null}));
 }catch(e){await db.storage.from('vet-clock-photos').remove([path]);throw e}
 await db.from('clock_attempts').insert({kiosk_id:profile.id,success:true});
 await log(profile,channel==='worker'?(open.length?'worker_clock_out':'worker_clock_in'):(open.length?'clock_out':'clock_in'),`${open.length?'Saída':'Entrada'} registrada para ${person.full_name} via ${channel==='worker'?'acesso pessoal':'terminal'}`,{worker_id:person.id,channel,requires_review:channel==='worker'||Boolean(open.length&&!open[0].terminal_id)});
 return {kind:open.length?'out':'in',name:person.full_name,time:now,requires_review:channel==='worker'};
}
async function manualSession(profile:any,body:any){administrator(profile);const workerId=text(body.worker_id,50),w=await getOne('profiles','id',workerId);must(w.role==='worker','Profissional inválido.');
 const reason=text(body.reason,500);must(reason.length>=5,'Informe uma justificativa de pelo menos cinco caracteres.');
 const start=dateValid(body.started_at);must(start,'Horário de entrada inválido.');must(start!.getTime()<=Date.now()+10*60*1000,'Não é permitido registrar uma entrada no futuro.');
 const end=body.ended_at?dateValid(body.ended_at):null;must(!body.ended_at||end,'Horário de saída inválido.');must(!end||end>start!,'A saída deve ser posterior à entrada.');
 let previous:Record<string,unknown>|null=null;
 if(body.id){const old=await getOne('work_sessions','id',text(body.id,50));must(old.worker_id===workerId,'Registro incompatível com o profissional.');previous={started_at:old.started_at,ended_at:old.ended_at,status:old.status,rate_snapshot:old.rate_snapshot};
  isPostgresError(await db.from('work_sessions').update({started_at:start!.toISOString(),ended_at:end?.toISOString()||null,status:'pending_review',reason,reviewed_at:null,reviewed_by:null,updated_at:new Date().toISOString()}).eq('id',old.id));
 }else{const history=isPostgresError(await db.from('worker_rate_history').select('hourly_rate').eq('worker_id',workerId).lte('effective_from',start!.toISOString()).order('effective_from',{ascending:false}).limit(1));const rate=history[0]?.hourly_rate??w.hourly_rate;isPostgresError(await db.from('work_sessions').insert({worker_id:workerId,started_at:start!.toISOString(),ended_at:end?.toISOString()||null,rate_snapshot:rate,status:'pending_review',reason}));}
 await log(profile,'manual_session',`Registro ajustado de ${w.full_name}: ${previous?.started_at||'novo'} → ${start!.toISOString()}; justificativa: ${reason}`,{worker_id:workerId,reason,before:previous,after:{started_at:start!.toISOString(),ended_at:end?.toISOString()||null}});return {ok:true};
}
async function reviewSession(profile:any,body:any){administrator(profile);must(body.confirmed===true,'É obrigatório confirmar que as câmeras foram verificadas.');const s=await getOne('work_sessions','id',text(body.id,50));must(s.status==='pending_review'&&s.ended_at,'Registro ainda não está pronto para conferir.');
 isPostgresError(await db.from('work_sessions').update({status:'reviewed',reviewed_by:profile.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',s.id));
 await log(profile,'review_session',`Registro conferido para ${s.worker_id}`,{session_id:s.id});return {ok:true};}
async function requestCorrection(profile:any,body:any){must(profile.role==='worker','Somente o profissional pode comunicar sua divergência.');const note=text(body.note,650);must(note.length>=5,'Explique a divergência.');isPostgresError(await db.from('correction_requests').insert({worker_id:profile.id,note}));await log(profile,'request_correction','Profissional comunicou divergência para conferência');return {ok:true}}
async function resolveRequest(profile:any,body:any){administrator(profile);isPostgresError(await db.from('correction_requests').update({status:'resolved',resolved_at:new Date().toISOString(),resolved_by:profile.id}).eq('id',text(body.id,50)));await log(profile,'resolve_request','Solicitação marcada como analisada');return {ok:true}}
async function approve(profile:any,body:any){administrator(profile);const workerId=text(body.worker_id,50),period=text(body.period_key,7);must(/^\d{4}-(0[1-9]|1[0-2])$/.test(period),'Período inválido.');
 const res=await db.rpc('nexa_approve_payment',{p_worker_id:workerId,p_period_key:period,p_actor_id:profile.id});const row=isPostgresError(res);
 await log(profile,'approve_payment',`Apuração aprovada: ${period}`,{worker_id:workerId,period_key:period,amount:row.amount});return {ok:true,approval:row};}
async function photoUrl(profile:any,body:any){administrator(profile);const path=text(body.path,250);must(path&&!path.includes('..'),'Fotografia inválida.');
 const [a,b]=await Promise.all([db.from('work_sessions').select('id').eq('started_photo_path',path).limit(1),db.from('work_sessions').select('id').eq('ended_photo_path',path).limit(1)]);
 must((a.data?.length||0)>0||(b.data?.length||0)>0,'Fotografia não corresponde a um registro autorizado.');
 const signed=await db.storage.from('vet-clock-photos').createSignedUrl(path,90);if(signed.error)throw Error('Não foi possível acessar a imagem.');await log(profile,'photo_view','Fotografia de registro consultada');return {url:signed.data.signedUrl};}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return fail('Método não permitido',405);
 if(!URL||!SERVICE||!ANON)return fail('Variáveis Supabase não configuradas',500);
 try{
  const auth=req.headers.get('authorization')||'';must(auth.startsWith('Bearer '),'Faça login para continuar.');const token=auth.substring(7);
  const {data:authResult,error:authError}=await db.auth.getUser(token);if(authError||!authResult.user)return fail('Sessão expirada ou inválida.',401);
  const profileResult=await db.from('profiles').select('*').eq('id',authResult.user.id).single();
  if(profileResult.error||!profileResult.data||!profileResult.data.is_active)return fail('Conta não cadastrada ou desativada.',403);
  const p=profileResult.data;const body=await req.json();const action=String(body.action||'');
  if(p.must_change_password&&!['bootstrap','change_password'].includes(action))return fail('É necessário trocar sua senha provisória antes de continuar.',403);
  let result:any;
  switch(action){
   case 'bootstrap':result=await bootstrap(p);break;
   case 'create_employee':administrator(p);result=await createAccount(p,body,'worker');break;
   case 'create_admin':administrator(p);must(['finance','owner'].includes(body.role),'Tipo de acesso inválido.');result=await createAccount(p,body,body.role);break;
   case 'create_kiosk':administrator(p);result=await createAccount(p,body,'kiosk');break;
   case 'update_employee':result=await updateWorker(p,body);break;
   case 'reset_password':result=await resetPassword(p,body);break;
   case 'change_password':result=await changePassword(p,body);break;
   case 'save_settings':result=await saveSettings(p,body);break;
   case 'clock':result=await clock(p,body,'kiosk');break;
   case 'worker_clock':result=await clock(p,body,'worker');break;
   case 'manual_session':result=await manualSession(p,body);break;
   case 'review_session':result=await reviewSession(p,body);break;
   case 'request_correction':result=await requestCorrection(p,body);break;
   case 'resolve_request':result=await resolveRequest(p,body);break;
   case 'approve_payment':result=await approve(p,body);break;
   case 'photo_url':result=await photoUrl(p,body);break;
   default:return fail('Ação não permitida.',400);
  }
  return answer(result);
 }catch(e){const message=e instanceof Error?e.message:'Erro inesperado.';console.error('nexa-api',message);return fail(message,400)}
});
