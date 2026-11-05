/* MODO DEMONSTRAÇÃO: dados e senhas fictícios ficam no navegador. NUNCA utilizar para operação real. */
(() => {
  const KEY='nexa_vet_additional_hours_demo_v2';
  const uid=()=>globalThis.crypto?.randomUUID?.() || `d${Date.now()}${Math.random().toString(36).slice(2)}`;
  const admin=u=>['owner','finance'].includes(u.role);
  const day=(offset,hr=18,min=0)=>{const d=new Date();d.setDate(d.getDate()+offset);d.setHours(hr,min,0,0);return d.toISOString()};
  const pub=u=>{const {password,rate,...p}=u;return p};
  function periodFor(iso,closing){const date=new Date(iso);let y=+new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(date);let m=+new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(date);const d=+new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',day:'numeric'}).format(date);if(d>Math.min(closing,new Date(y,m,0).getDate())){m++;if(m===13){m=1;y++}}return `${y}-${String(m).padStart(2,'0')}`}
  function closed(key,closing){return key<periodFor(new Date().toISOString(),closing)}
  function seed(){
    const users=[
      {id:'owner',role:'owner',name:'Mariana Oliveira',email:'dona@demo.nexa',password:'Demo@1234',active:true,must_change_password:false},
      {id:'finance',role:'finance',name:'Camila Santos',email:'financeiro@demo.nexa',password:'Demo@1234',active:true,must_change_password:false},
      {id:'w1',role:'worker',name:'Ana Martins',email:'ana@demo.nexa',password:'Demo@1234',rate:48,active:true,must_change_password:false,pj_cnpj:''},
      {id:'w2',role:'worker',name:'Carlos Ribeiro',email:'carlos@demo.nexa',password:'Demo@1234',rate:55,active:true,must_change_password:false,pj_cnpj:''},
      {id:'w3',role:'worker',name:'Júlia Ferreira',email:'julia@demo.nexa',password:'Demo@1234',rate:42,active:true,must_change_password:false,pj_cnpj:''},
    ];
    const extras=[
      {id:'x1',worker_id:'w1',started_at:day(-2,18),ended_at:day(-2,20,30),reason:'Atendimento de emergência de um paciente após o horário programado.',status:'pending',rate_snapshot:48,admin_note:null,reviewed_by:null,reviewed_at:null,created_at:day(-1)},
      {id:'x2',worker_id:'w2',started_at:day(-4,17,30),ended_at:day(-4,19),reason:'Auxílio no procedimento cirúrgico que precisou ser concluído.',status:'approved',rate_snapshot:55,admin_note:'Serviço confirmado pela gestão.',reviewed_by:'owner',reviewed_at:day(-3),created_at:day(-3)},
      {id:'x3',worker_id:'w1',started_at:day(-7,18),ended_at:day(-7,19,30),reason:'Acompanhamento de animal internado e entrega de informações ao tutor.',status:'approved',rate_snapshot:48,admin_note:'Conferido.',reviewed_by:'finance',reviewed_at:day(-6),created_at:day(-6)},
      {id:'x4',worker_id:'w3',started_at:day(-9,18),ended_at:day(-9,19),reason:'Permanência adicional para organizar os materiais da sala cirúrgica.',status:'rejected',rate_snapshot:42,admin_note:'Solicitação duplicada; serviço contabilizado em outro lançamento.',reviewed_by:'owner',reviewed_at:day(-8),created_at:day(-8)},
    ];
    return {users,settings:{company_name:'Clínica Veterinária Exemplo',closing_day:25},extras,payouts:[],audit:[],created_at:new Date().toISOString()};
  }
  let data;
  function load(){if(!data){try{data=JSON.parse(localStorage.getItem(KEY))}catch(_){}if(!data)data=seed()}return data}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(_){}}
  function errorIf(cond,msg){if(cond)throw Error(msg)}
  function getUser(id){const u=load().users.find(x=>x.id===id&&x.active);errorIf(!u,'Acesso não autorizado.');return u}
  function audit(u,action,details){load().audit.unshift({id:uid(),actor_name:u.name,actor_id:u.id,action,details,created_at:new Date().toISOString()})}
  function hours(x){return (new Date(x.ended_at)-new Date(x.started_at))/36e5}
  function checkInterval(start,end,skip=null,worker_id){const a=new Date(start),b=new Date(end);const h=(b-a)/36e5;errorIf(!Number.isFinite(h)||h<=0||h>16,'Informe um intervalo de 1 minuto até 16 horas.');errorIf(b>new Date(Date.now()+300000),'O término não pode estar no futuro.');errorIf(a<new Date(Date.now()-365*86400000),'O pedido deve ter ocorrido nos últimos 365 dias.');errorIf(load().extras.some(x=>x.id!==skip&&x.worker_id===worker_id&&x.status!=='rejected'&&new Date(x.started_at)<b&&a<new Date(x.ended_at)),'Já existe uma solicitação para parte desse horário.');return h}
  function snapshot(u){const db=load(),base={user:pub(u),settings:{...db.settings},extras:[],workers:[],payouts:[],admins:[],audit:[]};if(admin(u)){base.extras=db.extras.map(x=>({...x}));base.workers=db.users.filter(x=>x.role==='worker').map(x=>({...pub(x),rate:x.rate}));base.payouts=db.payouts.map(x=>({...x}));base.admins=db.users.filter(admin).map(pub);base.audit=db.audit.slice(0,160).map(x=>({...x}))}else{base.extras=db.extras.filter(x=>x.worker_id===u.id).map(({rate_snapshot,...x})=>({...x}))}return base}
  function covered(wid,key){return load().payouts.some(p=>p.worker_id===wid&&p.period_key===key)}
  function checkNotPaid(wid,end){errorIf(covered(wid,periodFor(end,load().settings.closing_day)),'Esse período já foi fechado e aprovado. Procure a administração.')}
  window.NexaDemo={
    credentials:{owner:['dona@demo.nexa','Demo@1234'],finance:['financeiro@demo.nexa','Demo@1234'],worker:['ana@demo.nexa','Demo@1234']},
    async login(email,password){const u=load().users.find(x=>x.email.toLowerCase()===String(email).trim().toLowerCase()&&x.password===password&&x.active);errorIf(!u,'E-mail ou senha inválidos.');return pub(u)},
    async run(id,action,p={}){
      const db=load(),u=getUser(id),adm=admin(u);let w,x;const requireAdmin=()=>errorIf(!adm,'Acesso restrito à administração.');
      switch(action){
        case 'bootstrap':return snapshot(u);
        case 'submit_extra':{
          errorIf(u.role!=='worker','Apenas profissionais podem enviar solicitações.');
          const reason=String(p.reason||'').trim();errorIf(reason.length<15||reason.length>1000,'Explique o motivo com pelo menos 15 caracteres (até 1.000).');
          checkInterval(p.started_at,p.ended_at,null,u.id);checkNotPaid(u.id,p.ended_at);
          db.extras.unshift({id:uid(),worker_id:u.id,started_at:new Date(p.started_at).toISOString(),ended_at:new Date(p.ended_at).toISOString(),reason,status:'pending',rate_snapshot:u.rate,admin_note:null,reviewed_by:null,reviewed_at:null,created_at:new Date().toISOString()});audit(u,'submit_extra','Solicitação de horas adicionais enviada.');break;
        }
        case 'approve_extra':case 'reject_extra':{
          requireAdmin();x=db.extras.find(e=>e.id===p.id);errorIf(!x||x.status!=='pending','Solicitação não encontrada ou já analisada.');checkNotPaid(x.worker_id,x.ended_at);
          const note=String(p.note||'').trim();errorIf(action==='reject_extra'&&note.length<8,'Informe o motivo da recusa (mínimo 8 caracteres).');
          x.status=action==='approve_extra'?'approved':'rejected';x.admin_note=note||null;x.reviewed_by=u.id;x.reviewed_at=new Date().toISOString();audit(u,action,`Solicitação ${x.id}: ${x.status}. ${note}`);break;
        }
        case 'edit_extra':{
          requireAdmin();x=db.extras.find(e=>e.id===p.id);errorIf(!x||x.status!=='pending','Somente pedidos pendentes podem ser corrigidos.');checkNotPaid(x.worker_id,x.ended_at);checkInterval(p.started_at,p.ended_at,x.id,x.worker_id);checkNotPaid(x.worker_id,p.ended_at);
          const reason=String(p.reason||'').trim(),justification=String(p.justification||'').trim();errorIf(reason.length<15||justification.length<12,'Preencha motivo do serviço e justificativa da correção.');
          audit(u,'edit_extra',`Correção de ${x.id}; antes: ${x.started_at} a ${x.ended_at} / ${x.reason}; depois: ${p.started_at} a ${p.ended_at} / ${reason}. Justificativa: ${justification}`);
          x.started_at=new Date(p.started_at).toISOString();x.ended_at=new Date(p.ended_at).toISOString();x.reason=reason;break;
        }
        case 'create_employee':{
          requireAdmin();const name=String(p.name||'').trim(),email=String(p.email||'').trim().toLowerCase(),rate=Number(p.rate);
          errorIf(name.length<3||!email.includes('@')||!Number.isFinite(rate)||rate<=0||rate>100000||String(p.password||'').length<8,'Informe nome, e-mail, valor/hora e senha provisória (mín. 8 caracteres).');
          errorIf(db.users.some(a=>a.email.toLowerCase()===email),'E-mail já cadastrado.');db.users.push({id:uid(),role:'worker',name,email,password:p.password,rate,pj_cnpj:String(p.pj_cnpj||''),active:true,must_change_password:true});audit(u,'create_employee',`Profissional ${name} cadastrado`);break;
        }
        case 'update_employee':{
          requireAdmin();w=db.users.find(a=>a.id===p.id&&a.role==='worker');errorIf(!w,'Profissional não encontrado.');
          const name=String(p.name||'').trim(),rate=Number(p.rate);errorIf(name.length<3||!Number.isFinite(rate)||rate<=0||rate>100000,'Nome ou valor inválido.');
          const oldRate=w.rate;w.name=name;w.rate=rate;w.active=Boolean(p.active);w.pj_cnpj=String(p.pj_cnpj||'');audit(u,'update_employee',`Profissional ${name}: valor/hora de ${oldRate} para ${rate}; ativo=${w.active}`);break;
        }
        case 'create_admin':{
          requireAdmin();const name=String(p.name||'').trim(),email=String(p.email||'').trim().toLowerCase();errorIf(name.length<3||!email.includes('@')||String(p.password||'').length<8,'Dados de acesso inválidos.');errorIf(db.users.some(a=>a.email===email),'E-mail já cadastrado.');
          db.users.push({id:uid(),role:'finance',name,email,password:p.password,active:true,must_change_password:true});audit(u,'create_admin',`Acesso administrativo criado: ${name}`);break;
        }
        case 'reset_password':{
          requireAdmin();w=db.users.find(a=>a.id===p.id);errorIf(!w||w.id===u.id||String(p.password||'').length<8,'Usuário ou senha inválidos.');w.password=p.password;w.must_change_password=true;audit(u,'reset_password',`Senha temporária para ${w.name}`);break;
        }
        case 'change_password':{
          errorIf(u.password!==p.current_password,'A senha atual está incorreta.');errorIf(String(p.new_password||'').length<8||p.new_password===p.current_password,'Escolha uma senha nova com 8 caracteres ou mais.');u.password=p.new_password;u.must_change_password=false;audit(u,'change_password','Senha alterada');break;
        }
        case 'save_settings':{
          requireAdmin();const name=String(p.company_name||'').trim(),n=Number(p.closing_day);errorIf(name.length<3||!Number.isInteger(n)||n<1||n>28,'Nome da clínica ou dia de fechamento inválido (1 a 28).');
          errorIf(db.payouts.length>0&&n!==db.settings.closing_day,'Não é possível alterar o dia de fechamento após existir apuração aprovada sem migração administrativa.');
          db.settings.company_name=name;db.settings.closing_day=n;audit(u,'save_settings',`Configurações atualizadas; fechamento dia ${n}`);break;
        }
        case 'approve_payout':{
          requireAdmin();const wid=String(p.worker_id),key=String(p.period_key);errorIf(!/^\d{4}-\d{2}$/.test(key)||!closed(key,db.settings.closing_day),'O período ainda não fechou.');errorIf(covered(wid,key),'Apuração já aprovada.');
          w=db.users.find(a=>a.id===wid&&a.role==='worker');errorIf(!w,'Profissional não encontrado.');const entries=db.extras.filter(e=>e.worker_id===wid&&periodFor(e.ended_at,db.settings.closing_day)===key);errorIf(!entries.length,'Não há solicitações neste período.');errorIf(entries.some(e=>e.status==='pending'),'Analise todas as solicitações pendentes antes do fechamento.');
          const accepted=entries.filter(e=>e.status==='approved'),h=accepted.reduce((s,e)=>s+hours(e),0),v=accepted.reduce((s,e)=>s+hours(e)*e.rate_snapshot,0);
          db.payouts.push({id:uid(),worker_id:wid,period_key:key,total_hours:h,total_amount:Math.round(v*100)/100,approved_by:u.id,approved_at:new Date().toISOString()});audit(u,'approve_payout',`Apuração ${key} aprovada para ${w.name}`);break;
        }
        case 'reset_demo':{errorIf(u.role!=='owner','Apenas a proprietária pode reiniciar a demonstração.');data=seed();save();return snapshot(data.users[0]);}
        default:throw Error('Operação desconhecida.');
      }
      save();return snapshot(u);
    }
  };
})();
