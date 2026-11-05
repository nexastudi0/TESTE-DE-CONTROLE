/* DEMONSTRAÇÃO LOCAL — dados ilustrativos, sem autenticação/armazenamento seguro.
   Nunca utilizar esta modalidade com dados reais de pacientes ou profissionais. */
(() => {
  const KEY='nexa_vet_control_demo_v1';
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
  const dateAt=(day,hour,minute=0,monthOffset=0)=>{const t=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date());const x=Object.fromEntries(t.map(v=>[v.type,v.value]));const d=new Date(Date.UTC(Number(x.year),Number(x.month)-1+monthOffset,day,15));const iso=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-03:00`;return new Date(iso).toISOString()};
  function seed(){
    const users=[
      {id:'owner',role:'owner',name:'Mariana Oliveira',email:'dona@demo.nexa',password:'Demo@1234',active:true,must_change_password:false},
      {id:'finance',role:'finance',name:'Camila Santos',email:'financeiro@demo.nexa',password:'Demo@1234',active:true,must_change_password:false},
      {id:'kiosk',role:'kiosk',name:'Recepção principal',email:'terminal@demo.nexa',password:'Demo@1234',active:true,must_change_password:false},
      {id:'p1',role:'worker',name:'Ana Martins',email:'ana@demo.nexa',password:'Demo@1234',pin:'158236',rate:48,active:true,must_change_password:false},
      {id:'p2',role:'worker',name:'Carlos Ribeiro',email:'carlos@demo.nexa',password:'Demo@1234',pin:'729415',rate:55,active:true,must_change_password:false},
      {id:'p3',role:'worker',name:'Júlia Ferreira',email:'julia@demo.nexa',password:'Demo@1234',pin:'436189',rate:42,active:true,must_change_password:false},
      {id:'p4',role:'worker',name:'Lucas Costa',email:'lucas@demo.nexa',password:'Demo@1234',pin:'804627',rate:60,active:true,must_change_password:false},
    ];
    const sessions=[];const dayCount=new Date().getDate();let i=0;
    for(let j=1;j<=Math.min(24,dayCount);j++){
      for(const w of users.filter(u=>u.role==='worker')){
        if((j+w.name.length)%5===0)continue;
        const start=dateAt(j,8+(w.name.length%2),0);const end=dateAt(j,14+(w.name.length%3),30);
        sessions.push({id:'s'+ ++i,worker_id:w.id,started_at:start,ended_at:end,status:'automatic',rate_snapshot:w.rate,started_photo_path:null,ended_photo_path:null,reason:null,reviewed_by:null,reviewed_at:null,created_at:end});
      }
    }
    if(sessions.length){const s=sessions[sessions.length-3];s.status='pending_review';s.reason='Exemplo: horário informado após esquecimento';}
    const audit=[{id:uid(),action:'system_setup',actor_name:'Nexa Studio',description:'Ambiente de demonstração preparado',created_at:new Date().toISOString()}];
    return {users,settings:{company_name:'Clínica Veterinária Exemplo',closing_day:25},sessions,approvals:[],audit,requests:[]};
  }
  let db;
  function load(){if(!db){try{db=JSON.parse(localStorage.getItem(KEY))}catch(_){} if(!db)db=seed()}return db}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(_){/* navegação privada / origem restrita: demonstração em memória */}}
  function log(actor,action,description){load().audit.unshift({id:uid(),actor_name:actor.name,action,description,created_at:new Date().toISOString()})}
  function snapshot(user){const d=load();if(user.role==='kiosk')return {user:publicUser(user),settings:d.settings,workers:[],sessions:[],approvals:[],audit:[],requests:[],admins:[]};if(user.role==='worker')return {user:publicUser(user),settings:d.settings,workers:[],sessions:d.sessions.filter(s=>s.worker_id===user.id),approvals:[],audit:[],requests:d.requests.filter(r=>r.worker_id===user.id),admins:[]};return {user:publicUser(user),settings:d.settings,workers:d.users.filter(u=>u.role==='worker').map(publicUser),sessions:d.sessions,approvals:d.approvals,audit:d.audit,requests:d.requests,admins:d.users.filter(u=>u.role==='owner'||u.role==='finance').map(publicUser)};}
  const publicUser=u=>{const {password,pin,...clean}=u;return clean};
  const admin=u=>['owner','finance'].includes(u.role);
  function can(u,condition){if(!condition)throw Error('Você não tem permissão para executar esta ação.')}
  const between=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
  const periodEnd=(key,day)=>{const [y,m]=key.split('-').map(Number);const last=new Date(y,m,0).getDate();return new Date(y,m-1,Math.min(day,last),23,59,59,999)};
  const periodFor=(iso,day)=>{let d=new Date(iso);let y=d.getFullYear(),m=d.getMonth()+1;const key=`${y}-${String(m).padStart(2,'0')}`;if(d>periodEnd(key,day)){m++;if(m===13){m=1;y++}}return `${y}-${String(m).padStart(2,'0')}`};
  window.NexaDemo={
    credentials:{owner:['dona@demo.nexa','Demo@1234'],finance:['financeiro@demo.nexa','Demo@1234'],worker:['ana@demo.nexa','Demo@1234'],kiosk:['terminal@demo.nexa','Demo@1234']},
    async login(email,password){const user=load().users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&u.password===password&&u.active);if(!user)throw Error('E-mail ou senha inválidos.');return publicUser(user)},
    async get(userId){let u=load().users.find(x=>x.id===userId&&x.active);if(!u)throw Error('Conta não disponível');return snapshot(u)},
    async run(userId,action,payload={}){const d=load();const user=d.users.find(u=>u.id===userId&&u.active);if(!user)throw Error('Sessão inválida.');let w,s;
      switch(action){
        case 'bootstrap':return snapshot(user);
        case 'create_employee':
          can(user,admin(user));
          if(!payload.name?.trim()||!payload.email?.includes('@')||!/^\d{6}$/.test(payload.pin)||!between(Number(payload.rate),0.01,100000)||payload.password?.length<8)throw Error('Preencha os dados corretamente.');
          if(d.users.some(u=>u.email.toLowerCase()===payload.email.toLowerCase()))throw Error('E-mail já cadastrado.');
          if(d.users.some(u=>u.pin===payload.pin))throw Error('Este PIN já está em uso.');
          d.users.push({id:uid(),role:'worker',name:payload.name.trim(),email:payload.email.trim().toLowerCase(),password:payload.password,pin:payload.pin,rate:Number(payload.rate),pj_cnpj:payload.pj_cnpj||null,pj_legal_name:payload.pj_legal_name||null,active:true,must_change_password:true});log(user,'create_employee',`Profissional ${payload.name} cadastrado`);break;
        case 'update_employee':
          can(user,admin(user));w=d.users.find(x=>x.id===payload.id&&x.role==='worker');if(!w)throw Error('Profissional não encontrado.');
          if(payload.name!==undefined){if(!payload.name.trim())throw Error('Nome obrigatório.');w.name=payload.name.trim()}
          if(payload.rate!==undefined){if(!between(Number(payload.rate),.01,100000))throw Error('Valor inválido.');w.rate=Number(payload.rate)}
          if(payload.active!==undefined)w.active=Boolean(payload.active);if(payload.pj_cnpj!==undefined)w.pj_cnpj=payload.pj_cnpj||null;if(payload.pj_legal_name!==undefined)w.pj_legal_name=payload.pj_legal_name||null;
          if(payload.pin){if(!/^\d{6}$/.test(payload.pin))throw Error('PIN deve ter 6 dígitos.');if(d.users.some(x=>x.id!==w.id&&x.pin===payload.pin))throw Error('PIN já utilizado.');w.pin=payload.pin}
          log(user,'update_employee',`Cadastro de ${w.name} atualizado`);break;
        case 'reset_password':
          can(user,admin(user));w=d.users.find(x=>x.id===payload.id&&x.role==='worker');if(!w||payload.password?.length<8)throw Error('Profissional ou senha inválidos.');w.password=payload.password;w.must_change_password=true;log(user,'reset_password',`Senha provisória emitida para ${w.name}`);break;
        case 'create_admin':
          can(user,user.role==='owner');if(!payload.name?.trim()||!payload.email?.includes('@')||payload.password?.length<8||!['owner','finance'].includes(payload.role))throw Error('Dados inválidos.');
          if(d.users.some(x=>x.email.toLowerCase()===payload.email.toLowerCase()))throw Error('E-mail já cadastrado.');
          d.users.push({id:uid(),name:payload.name.trim(),email:payload.email.trim(),password:payload.password,role:payload.role,active:true,must_change_password:true});log(user,'create_admin','Novo acesso administrativo cadastrado');break;
        case 'create_kiosk':
          can(user,admin(user));if(!payload.email?.includes('@')||payload.password?.length<8||!payload.name?.trim())throw Error('Dados inválidos.');
          if(d.users.some(x=>x.email.toLowerCase()===payload.email.toLowerCase()))throw Error('E-mail já cadastrado.');
          d.users.push({id:uid(),name:payload.name.trim(),email:payload.email.trim(),password:payload.password,role:'kiosk',active:true,must_change_password:false});log(user,'create_kiosk','Terminal de recepção cadastrado');break;
        case 'save_settings':
          can(user,admin(user));if(!between(Number(payload.closing_day),1,31)||!payload.company_name?.trim())throw Error('Informe uma clínica e um dia de fechamento válidos.');
          d.settings={company_name:payload.company_name.trim(),closing_day:Number(payload.closing_day)};log(user,'save_settings','Configuração de fechamento atualizada');break;
        case 'clock':
          can(user,user.role==='kiosk');if(!/^\d{6}$/.test(payload.pin))throw Error('O PIN precisa de seis dígitos.');
          if(!payload.photo_base64?.startsWith('data:image/jpeg;base64,'))throw Error('Capture a foto para registrar.');
          w=d.users.find(x=>x.pin===payload.pin&&x.role==='worker'&&x.active);if(!w)throw Error('PIN inválido ou profissional inativo.');
          s=d.sessions.find(x=>x.worker_id===w.id&&!x.ended_at);
          if(s){s.ended_at=new Date().toISOString();s.ended_photo_path='demo-photo';s.status=s.status==='pending_review'||s.reason?.startsWith('Registro via login pessoal')?'pending_review':'automatic';log(user,'clock_out',`Saída registrada para ${w.name}`);save();return {kind:'out',name:w.name,time:s.ended_at}}
          s={id:uid(),worker_id:w.id,started_at:new Date().toISOString(),ended_at:null,status:'open',rate_snapshot:w.rate,started_photo_path:'demo-photo',ended_photo_path:null,reason:null,reviewed_by:null,reviewed_at:null,created_at:new Date().toISOString()};d.sessions.unshift(s);log(user,'clock_in',`Entrada registrada para ${w.name}`);save();return {kind:'in',name:w.name,time:s.started_at};
        case 'worker_clock':
          can(user,user.role==='worker');if(!/^\d{6}$/.test(payload.pin))throw Error('O PIN precisa de seis dígitos.');
          if(!payload.photo_base64?.startsWith('data:image/jpeg;base64,'))throw Error('É obrigatório tirar uma foto ao vivo.');
          if(user.pin!==payload.pin)throw Error('PIN não corresponde ao seu cadastro.');
          s=d.sessions.find(x=>x.worker_id===user.id&&!x.ended_at);
          if(s&&Date.now()-new Date(s.started_at).valueOf()>36*3600*1000)throw Error('Registro anterior muito antigo. Solicite correção administrativa.');
          if(s){s.ended_at=new Date().toISOString();s.ended_photo_path='demo-photo';s.status='pending_review';log(user,'worker_clock_out','Saída registrada no acesso pessoal (aguarda conferência)');save();return {kind:'out',name:user.name,time:s.ended_at,requires_review:true}}
          s={id:uid(),worker_id:user.id,started_at:new Date().toISOString(),ended_at:null,status:'open',rate_snapshot:user.rate,started_photo_path:'demo-photo',ended_photo_path:null,reason:'Registro via login pessoal; necessita conferência das câmeras.',reviewed_by:null,reviewed_at:null,created_at:new Date().toISOString()};d.sessions.unshift(s);log(user,'worker_clock_in','Entrada registrada no acesso pessoal (aguarda conferência após saída)');save();return {kind:'in',name:user.name,time:s.started_at,requires_review:true};
        case 'manual_session':
          can(user,admin(user));w=d.users.find(x=>x.id===payload.worker_id&&x.role==='worker');if(!w)throw Error('Profissional não encontrado.');if(!payload.reason?.trim()||!payload.started_at)throw Error('Informe o motivo e o horário.');
          if(payload.ended_at&&new Date(payload.started_at)>=new Date(payload.ended_at))throw Error('A saída precisa ser posterior à entrada.');
          if(payload.id){s=d.sessions.find(x=>x.id===payload.id);if(!s||d.approvals.some(a=>a.worker_id===s.worker_id&&a.period_key===periodFor(s.started_at,d.settings.closing_day)))throw Error('Registro não editável.');s.started_at=new Date(payload.started_at).toISOString();s.ended_at=payload.ended_at?new Date(payload.ended_at).toISOString():null;s.reason=payload.reason.trim();s.status='pending_review'}
          else d.sessions.unshift({id:uid(),worker_id:w.id,started_at:new Date(payload.started_at).toISOString(),ended_at:payload.ended_at?new Date(payload.ended_at).toISOString():null,status:'pending_review',rate_snapshot:w.rate,reason:payload.reason.trim(),reviewed_by:null,reviewed_at:null,started_photo_path:null,ended_photo_path:null,created_at:new Date().toISOString()});
          log(user,'manual_session',`Registro de ${w.name} aguardando conferência`);break;
        case 'review_session':
          can(user,admin(user));s=d.sessions.find(x=>x.id===payload.id);if(!s)throw Error('Registro não encontrado.');if(s.status!=='pending_review'||!s.ended_at)throw Error('Ajuste não está pronto para conferência.');if(!payload.confirmed)throw Error('Confirme que as câmeras foram conferidas.');
          s.status='reviewed';s.reviewed_by=user.id;s.reviewed_at=new Date().toISOString();log(user,'review_session','Correção conferida com câmeras');break;
        case 'request_correction':
          can(user,user.role==='worker');if(!payload.note?.trim())throw Error('Explique o que precisa ser conferido.');d.requests.unshift({id:uid(),worker_id:user.id,note:payload.note.trim(),created_at:new Date().toISOString(),status:'open'});log(user,'request_correction','Profissional comunicou divergência');break;
        case 'resolve_request':
          can(user,admin(user));s=d.requests.find(r=>r.id===payload.id);if(!s)throw Error('Solicitação não encontrada.');s.status='resolved';log(user,'resolve_request','Solicitação analisada');break;
        case 'approve_payment':
          can(user,admin(user));w=d.users.find(x=>x.id===payload.worker_id&&x.role==='worker');if(!w)throw Error('Profissional não encontrado.');
          if(d.approvals.some(a=>a.worker_id===w.id&&a.period_key===payload.period_key))throw Error('Pagamento já aprovado.');
          const relevant=d.sessions.filter(s=>s.worker_id===w.id&&periodFor(s.started_at,d.settings.closing_day)===payload.period_key);
          if(!relevant.length||relevant.some(s=>!s.ended_at||s.status==='pending_review'))throw Error('Existem registros pendentes ou nenhum serviço neste período.');
          const hours=relevant.reduce((a,s)=>a+(new Date(s.ended_at)-new Date(s.started_at))/3600000,0);
          const amount=relevant.reduce((a,s)=>a+((new Date(s.ended_at)-new Date(s.started_at))/3600000)*s.rate_snapshot,0);
          d.approvals.push({id:uid(),worker_id:w.id,period_key:payload.period_key,hours,amount:Math.round(amount*100)/100,approved_at:new Date().toISOString(),approved_by:user.id});log(user,'approve_payment',`Pagamento de ${w.name} aprovado`);break;
        case 'change_password':
          if(payload.current_password!==user.password)throw Error('Senha atual incorreta.');if(!payload.new_password||payload.new_password.length<8)throw Error('A nova senha precisa ter pelo menos 8 caracteres.');if(payload.new_password===user.password)throw Error('A nova senha precisa ser diferente da atual.');user.password=payload.new_password;user.must_change_password=false;log(user,'change_password','Senha pessoal alterada');break;
        case 'photo_url':return {url:null};
        default:throw Error('Ação não implementada.');
      }
      save();return snapshot(user);
    },
    reset(){db=seed();save()}
  };
})();
