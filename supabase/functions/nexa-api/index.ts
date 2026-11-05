// Supabase Edge Function — NEXA VET CONTROL v2.0 (horas adicionais)
// Usa o bearer token do usuário e a service role SOMENTE no servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

type Json = Record<string, unknown>;
const url=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
const allowedOrigin=Deno.env.get('APP_ORIGIN')||'*'; // definir origem HTTPS de produção para restringir CORS
const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
const authClient=createClient(url,publicKey,{auth:{autoRefreshToken:false,persistSession:false}});
const fields='id,worker_id,started_at,ended_at,reason,status,rate_snapshot,admin_note,reviewed_by,reviewed_at,created_at';
const cors={ 'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Vary':'Origin' };
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function fail(message:string,status=400):never {throw Object.assign(new Error(message),{status})}
function check(q:unknown,error='Operação não autorizada.',status=400){if(!q)fail(error,status)}
function str(x:unknown,max=500){return String(x??'').trim().slice(0,max)}
function isAdmin(p:Json){return p.role==='owner'||p.role==='finance'}
function tableError(error:unknown){if(error)throw error}
function pd(iso:string,day:number){const entries=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));const o=Object.fromEntries(entries.map(x=>[x.type,x.value]));let y=Number(o.year),m=Number(o.month),d=Number(o.day);if(d>Math.min(day,new Date(y,m,0).getDate())){m++;if(m===13){m=1;y++}}return `${y}-${String(m).padStart(2,'0')}`}
function interval(a:unknown,b:unknown){const start=new Date(String(a)),end=new Date(String(b)),h=(end.getTime()-start.getTime())/36e5;check(Number.isFinite(h)&&h>0&&h<=16,'O serviço adicional deve durar entre 1 minuto e 16 horas.');check(end.getTime()<=Date.now()+300000,'Não informe horas futuras.');check(start.getTime()>=Date.now()-365*86400000,'A solicitação deve ter ocorrido nos últimos 365 dias.');return {start:start.toISOString(),end:end.toISOString(),hours:h}}
function safeUser(p:Json){return {id:p.id,role:p.role,name:p.full_name,email:p.email,active:p.active,must_change_password:p.must_change_password,pj_cnpj:p.pj_cnpj||''}}
async function getSettings(){const {data,error}=await db.from('clinic_settings').select('company_name,closing_day').eq('id',1).single();tableError(error);return data!}
async function audit(user:Json,action:string,details:string){const {error}=await db.from('audit_logs').insert({actor_id:user.id,actor_name:user.full_name,action,details});tableError(error)}
async function isPaid(workerId:string,period:string){const {data,error}=await db.from('payouts').select('id').eq('worker_id',workerId).eq('period_key',period).maybeSingle();tableError(error);return Boolean(data)}
async function notPaid(workerId:string,iso:string,closing:number){check(!(await isPaid(workerId,pd(iso,closing))),'O período desse profissional já foi aprovado e não pode ser alterado.')}
async function profile(uid:string){const {data,error}=await db.from('profiles').select('*').eq('id',uid).single();tableError(error);check(data&&data.active,'Usuário sem cadastro ativo.',403);return data as Json}
async function noOverlap(workerId:string,start:string,end:string,except?:string){let query=db.from('extra_hours').select('id').eq('worker_id',workerId).neq('status','rejected').lt('started_at',end).gt('ended_at',start).limit(1);if(except)query=query.neq('id',except);const {data,error}=await query;tableError(error);check(!data?.length,'Já existe uma solicitação para parte deste horário.')}
async function bootstrap(user:Json){const settings=await getSettings();const adm=isAdmin(user);const {data:extras,error:extrasErr}=await db.from('extra_hours').select(fields).order('created_at',{ascending:false}).limit(5000).match(adm?{}:{worker_id:user.id});tableError(extrasErr);
 if(!adm)return {user:safeUser(user),settings,extras:(extras||[]).map(({rate_snapshot,...x})=>x),workers:[],payouts:[],admins:[],audit:[]};
 const [{data:profiles,error:pe},{data:rates,error:re},{data:payouts,error:payerr},{data:auditLogs,error:auerr}]=await Promise.all([
 db.from('profiles').select('id,full_name,email,role,pj_cnpj,active,must_change_password').order('full_name'),
 db.from('hourly_rates').select('worker_id,rate'),
 db.from('payouts').select('*').order('approved_at',{ascending:false}).limit(5000),
 db.from('audit_logs').select('id,actor_name,action,details,created_at').order('created_at',{ascending:false}).limit(160)
 ]);[pe,re,payerr,auerr].forEach(tableError);
 const rMap=new Map((rates||[]).map((r)=>[r.worker_id,Number(r.rate)]));
 const mapProfile=(p:Json)=>({id:p.id,name:p.full_name,email:p.email,role:p.role,pj_cnpj:p.pj_cnpj||'',active:p.active,must_change_password:p.must_change_password});
 return {user:safeUser(user),settings,extras,workers:(profiles||[]).filter(p=>p.role==='worker').map(p=>({...mapProfile(p),rate:rMap.get(p.id)})),admins:(profiles||[]).filter(p=>p.role!=='worker').map(mapProfile),payouts,audit:auditLogs};
}
async function createAccount(actor:Json,p:Json,role:string){const full_name=str(p.name,140),email=str(p.email,200).toLowerCase(),password=String(p.password??'');check(full_name.length>=3&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)&&password.length>=8&&password.length<=128,'Preencha nome, e-mail e senha provisória com no mínimo 8 caracteres.');
 const {data:created,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error)fail('Não foi possível criar o usuário: '+error.message);const id=created.user!.id;
 try{const {error:e}=await db.from('profiles').insert({id,full_name,email,role,pj_cnpj:role==='worker'?str(p.pj_cnpj,30):null,must_change_password:true});tableError(e);
 if(role==='worker'){const rate=Number(p.rate);check(Number.isFinite(rate)&&rate>0&&rate<=100000,'Informe um valor por hora válido.');const {error:rateErr}=await db.from('hourly_rates').insert({worker_id:id,rate});tableError(rateErr)}
 await audit(actor,role==='worker'?'create_employee':'create_admin',`Conta criada: ${full_name}`);
 }catch(e){await db.auth.admin.deleteUser(id);throw e}
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return respond({error:'Método inválido.'},405);
 if(!url||!serviceKey||!publicKey)return respond({error:'Supabase ainda não configurado no servidor.'},503);
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');check(token,'Faça login novamente.',401);
  const {data:auth,error:ae}=await db.auth.getUser(token);if(ae||!auth.user)fail('Sessão inválida ou expirada.',401);
  const user=await profile(auth.user.id);
  const {action,payload}=(await req.json()) as {action:string,payload?:Json};const p=payload||{};
  if(action==='bootstrap')return respond(await bootstrap(user));
  const adm=isAdmin(user), settings=await getSettings();let x:Json,resp:any;
  if(action==='submit_extra'){
   check(user.role==='worker','Somente profissionais enviam pedidos.');const reason=str(p.reason,1001);check(reason.length>=15&&reason.length<=1000,'Descreva o motivo com pelo menos 15 caracteres.');const {start,end}=interval(p.started_at,p.ended_at);
   await notPaid(String(user.id),end,settings.closing_day);await noOverlap(String(user.id),start,end);
   const {data:rate,error:er}=await db.from('hourly_rates').select('rate').eq('worker_id',user.id).single();tableError(er);
   const {error}=await db.from('extra_hours').insert({worker_id:user.id,started_at:start,ended_at:end,reason,rate_snapshot:rate!.rate});tableError(error);await audit(user,'submit_extra','Solicitação de serviço adicional enviada');
  }else if(action==='change_password'){
   const old=String(p.current_password||''),password=String(p.new_password||'');check(password.length>=8&&password.length<=128&&password!==old,'Escolha uma nova senha de pelo menos 8 caracteres.');
   const {error:verifyErr}=await authClient.auth.signInWithPassword({email:String(user.email),password:old});check(!verifyErr,'Senha atual incorreta.');
   const {error:e}=await db.auth.admin.updateUserById(String(user.id),{password});tableError(e);const {error:ue}=await db.from('profiles').update({must_change_password:false}).eq('id',user.id);tableError(ue);await audit(user,'change_password','Senha pessoal alterada');
  }else{
   check(adm,'Acesso restrito à proprietária e ao financeiro.');
   if(action==='create_employee'||action==='create_admin'){await createAccount(user,p,action==='create_employee'?'worker':'finance')}
   else if(action==='update_employee'){
    const id=str(p.id,50),name=str(p.name,140),rate=Number(p.rate);check(name.length>=3&&Number.isFinite(rate)&&rate>0&&rate<=100000,'Nome ou valor por hora inválido.');const {data:target,error:terr}=await db.from('profiles').select('id,role').eq('id',id).single();tableError(terr);check(target?.role==='worker','Profissional não encontrado.');
    const {error:e}=await db.from('profiles').update({full_name:name,pj_cnpj:str(p.pj_cnpj,30),active:Boolean(p.active)}).eq('id',id);tableError(e);const {error:rerr}=await db.from('hourly_rates').upsert({worker_id:id,rate,updated_at:new Date().toISOString()});tableError(rerr);await audit(user,'update_employee',`Cadastro e valor-hora atualizados: ${name}`);
   }
   else if(action==='reset_password'){
    const id=str(p.id,50),password=String(p.password||'');check(id!==user.id&&password.length>=8&&password.length<=128,'Senha inválida ou tentativa de redefinir a própria conta.');const target=await profile(id);
    const {error:e}=await db.auth.admin.updateUserById(id,{password});tableError(e);const {error:ue}=await db.from('profiles').update({must_change_password:true}).eq('id',id);tableError(ue);await audit(user,'reset_password',`Senha provisória redefinida: ${target.full_name}`);
   }
   else if(action==='save_settings'){
    const name=str(p.company_name,140),day=Number(p.closing_day);check(name.length>=3&&Number.isInteger(day)&&day>=1&&day<=28,'Nome da clínica ou dia de fechamento inválido.');
    if(day!==settings.closing_day){const {count,error}=await db.from('payouts').select('id',{count:'exact',head:true});tableError(error);check(!count,'O dia de fechamento não pode ser alterado após haver apurações aprovadas.');}
    const {error:e}=await db.from('clinic_settings').update({company_name:name,closing_day:day,updated_at:new Date().toISOString()}).eq('id',1);tableError(e);await audit(user,'save_settings',`Configurações atualizadas; dia ${day}`);
   }
   else if(action==='approve_extra'||action==='reject_extra'||action==='edit_extra'){
    const id=str(p.id,50);const {data:found,error:e}=await db.from('extra_hours').select(fields).eq('id',id).single();tableError(e);check(found&&found.status==='pending','Solicitação não encontrada ou já analisada.');x=found!;
    await notPaid(String(x.worker_id),String(x.ended_at),settings.closing_day);
    if(action==='edit_extra'){
     const reason=str(p.reason,1001),justification=str(p.justification,751);check(reason.length>=15&&reason.length<=1000&&justification.length>=12&&justification.length<=750,'Informe motivo do serviço e justificativa da correção.');const {start,end}=interval(p.started_at,p.ended_at);await notPaid(String(x.worker_id),end,settings.closing_day);await noOverlap(String(x.worker_id),start,end,id);
     const {data:changed,error:ue}=await db.from('extra_hours').update({started_at:start,ended_at:end,reason,updated_at:new Date().toISOString()}).eq('id',id).eq('status','pending').select('id').maybeSingle();tableError(ue);check(changed,'Solicitação já analisada.');await audit(user,'edit_extra',`Pedido ${id}: ${x.started_at} a ${x.ended_at}; motivo original: ${x.reason}; corrigido: ${start} a ${end}; novo motivo: ${reason}. Justificativa: ${justification}`);
    }else{
     const note=str(p.note,1000);if(action==='reject_extra')check(note.length>=8,'Justifique a recusa.');
     const stat=action==='approve_extra'?'approved':'rejected';const {data:changed,error:ue}=await db.from('extra_hours').update({status:stat,admin_note:note||null,reviewed_by:user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).eq('status','pending').select('id').maybeSingle();tableError(ue);check(changed,'Solicitação já analisada.');await audit(user,action,`Pedido ${id}: ${stat}. ${note}`);
    }
   }
   else if(action==='approve_payout'){
    const workerId=str(p.worker_id,50),key=str(p.period_key,7);check(/^\d{4}-(0[1-9]|1[0-2])$/.test(key)&&key<pd(new Date().toISOString(),settings.closing_day),'O período ainda não foi encerrado.');check(!(await isPaid(workerId,key)),'Apuração já aprovada.');
    const target=await profile(workerId);check(target.role==='worker','Profissional inválido.');
    const {data:list,error:e}=await db.from('extra_hours').select(fields).eq('worker_id',workerId).order('created_at',{ascending:false}).limit(5000);tableError(e);
    const entries=(list||[]).filter(x=>pd(x.ended_at,settings.closing_day)===key);check(entries.length>0,'Não há solicitações nesse período.');check(!entries.some(x=>x.status==='pending'),'Existem solicitações pendentes de análise.');
    const accepted=entries.filter(x=>x.status==='approved'),hours=accepted.reduce((s,x)=>s+(new Date(x.ended_at).getTime()-new Date(x.started_at).getTime())/3600000,0),amount=accepted.reduce((s,x)=>s+(new Date(x.ended_at).getTime()-new Date(x.started_at).getTime())/3600000*Number(x.rate_snapshot),0);
    const {error:pe}=await db.from('payouts').insert({worker_id:workerId,period_key:key,total_hours:hours,total_amount:Math.round(amount*100)/100,approved_by:user.id});tableError(pe);await audit(user,'approve_payout',`Apuração ${key} aprovada para ${target.full_name}`);
   }
   else fail('Operação desconhecida.',404);
  }
  return respond(await bootstrap(user));
 }catch(e){const err=e as {message?:string,status?:number};console.error('nexa-api failed:',err.message);return respond({error:err.status?err.message:'Não foi possível concluir a operação. Confira os dados e tente novamente.'},err.status||400)}
});
