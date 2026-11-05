# NEXA VET CONTROL 2.0 — HORAS ADICIONAIS

**Nova finalidade:** controlar SOMENTE pedidos de horas adicionais de serviços realizados por profissionais PJ. Este projeto **não registra ponto**, não registra jornada diária, não usa PIN, câmera, fotos ou terminal de recepção.

## Funcionalidades incluídas

**Profissionais:** login pessoal, troca obrigatória de senha no primeiro acesso, novo pedido de horas adicionais com início e fim e **motivo obrigatório (mínimo 15 caracteres)**; histórico próprio, acompanhamento de pendência, aprovação ou recusa, sem acesso aos valores de outros usuários nem à tarifa individual.

**Proprietária e financeiro:** logins separados com a mesma permissão administrativa; cadastro/inativação de prestadores, valores/hora individuais, criação e redefinição de credenciais, aprovação/recusa dos pedidos, correções justificadas e auditadas, filtros, relatórios, CSV, impressão em PDF, dia de fechamento configurável (de 1 a 28) e aprovação da apuração mensal por profissional. O cálculo considera **apenas pedidos aprovados**. A tarifa da solicitação fica congelada no instante do pedido; alterações posteriores de tarifa não recalculam o passado.

**PWA:** layout responsivo com menu de navegação móvel, splash da Nexa Studio e instalação via Chrome no Android ou Safari no iPhone/iPad, após publicação em HTTPS. O cache serve apenas os arquivos públicos da interface; sem internet o servidor não aceita novas solicitações.

## Como testar a demonstração

1. Extraia o ZIP e abra o `index.html`. Se o navegador não abrir recursos em `file://`, use um servidor estático ou GitHub Pages.
2. Clique em **Profissional**, depois **Novo pedido**. Informe as datas, horários e o motivo do serviço adicional. Envie.
3. Saia e entre como **Dona** para verificar os pedidos; acesse **Solicitações**, abra um pedido e aprove ou recuse. O botão **Corrigir** permite corrigir datas e motivo **somente com justificativa obrigatória**.
4. No painel da dona, abra **Profissionais** para cadastrar outra pessoa, ajustar valores e criar uma senha inicial; abra **Configurações** para definir o fechamento e criar o login do financeiro.
5. Consulte **Financeiro** para apurar valores; um período só pode ser aprovado depois de fechado e sem pedidos pendentes. Abra **Relatórios** para exportar CSV.

Credenciais fictícias, somente para demonstração:

| Papel | E-mail | Senha |
|---|---|---|
| Proprietária | dona@demo.nexa | Demo@1234 |
| Financeiro | financeiro@demo.nexa | Demo@1234 |
| Profissional | ana@demo.nexa | Demo@1234 |

A demonstração usa `localStorage` do navegador e **não compartilha dados entre dispositivos**. Os cadastros e senhas nela são apenas simulação. **Não use dados reais**.

## Colocar em produção (Supabase)

A versão anterior (v1.x) tinha esquema de marcação de ponto incompatível. **A v2.0 deve começar em um projeto Supabase novo**, a menos que uma migração explícita seja desenvolvida e testada. Não rode o SQL da v2 sobre o banco da v1.

1. A dona da clínica cria um novo projeto Supabase, de preferência sob a conta dela. Em **Authentication > Providers**, desative o autocadastro público. Configure recuperação de senha e políticas de autenticação adequadas.
2. Execute o arquivo completo `supabase/schema.sql` no **SQL Editor** do projeto novo. As tabelas têm RLS ativo **sem políticas de acesso direto de usuário**: a Edge Function executa as operações autorizadas no servidor.
3. Em **Authentication > Users**, crie a dona (e-mail real e senha forte), confirme o e-mail, copie o UUID do usuário e execute o SQL abaixo, adaptado:

```sql
insert into public.profiles (id, full_name, email, role, active, must_change_password)
values (
  'UUID_DA_USUARIA_DONA',
  'Nome da proprietária',
  'email.real@clinica.com.br',
  'owner', true, false
);
```

4. Instale a CLI do Supabase, rode `supabase login` e conecte o projeto com `supabase link --project-ref REF_DO_PROJETO`.
5. Configure a origem do frontend publicado (HTTPS) para CORS: `supabase secrets set APP_ORIGIN="https://seu-dominio.com"` (sem barra final). As variáveis internas `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` precisam existir no ambiente da função. **Jamais publique a service role no frontend.**
6. Na pasta que contém `supabase/`, rode `supabase functions deploy nexa-api`. O arquivo `supabase/config.toml` mantém a verificação de JWT ativada.
7. Configure `config.js` com a URL do projeto, sua chave **publishable/anon** e `functionName: 'nexa-api'`. A chave publishable pode ficar no cliente; a chave service role, **nunca**.
8. Publique **somente a interface** (`index.html`, `styles.css`, `extra.css`, `app.js`, `demo.js`, `config.js`, `sw.js`, `manifest.webmanifest` e `assets/`) em hospedagem HTTPS. Depois entre como dona e cadastre o financeiro e os profissionais.

### Permissões e confidencialidade dos valores

O **backend** devolve os valores individuais por hora e totais financeiros somente para proprietária e financeiro. O profissional só recebe suas próprias solicitações, sem tarifas e sem acesso às informações dos colegas. Não basta ocultar a informação com CSS: o bloqueio está na Edge Function e nas tabelas protegidas.

**Privacidade da proprietária:** se você, desenvolvedor, tiver acesso ao banco como dono ou possuir a service role, ainda poderá consultar valores. Para que os valores sejam realmente privados perante o desenvolvedor, a proprietária deve administrar seu próprio projeto Supabase e restringir seu acesso ao banco/segredos depois da implantação. Contas administrativas do próprio aplicativo podem visualizar os valores.

### Regras de negócio da versão 2.0

- Cada solicitação contém início, fim, duração calculada e **motivo obrigatório**. Não existe marcação de presença diária.
- Limite por solicitação: 16 horas; não aceita pedido futuro, sobreposição com pedido existente que não foi recusado, nem pedido com mais de 365 dias.
- Depois de enviado, o profissional não altera o pedido. Administração pode corrigir um pedido pendente com justificativa obrigatória, com auditoria da alteração.
- Pedidos ficam `pending`, `approved` ou `rejected`. Recusa exige justificativa. Apenas `approved` entra no valor a apurar.
- Valores por hora podem ser alterados pela administração; cada solicitação conserva o valor/hora que existia ao ser enviada.
- Um fechamento mensal só pode ser aprovado quando o período encerrou e não há pedidos pendentes para aquele profissional. Apurações aprovadas são bloqueadas contra alteração posterior via API.
- O registro da apuração **não transfere dinheiro** nem emite nota fiscal; a clínica executa as etapas contábeis e financeiras separadamente.

### Considerações de implantação e segurança

Esta entrega inclui um **protótipo funcional demonstrável e código-base para backend de produção**. É necessário implantar em Supabase real, executar testes de integração, autenticação, permissões, concorrência, backup e recuperação de conta, e revisar juridicamente os contratos antes de operar. Evite usar dados reais na demonstração. O esquema não migra registros históricos da v1.

Como os profissionais são **PJs**, o projeto usa “horas adicionais de serviço” para descrever o que foi prestado, e **não** presume aplicação automática de adicional trabalhista. O uso prático, a contratação, a subordinação e as obrigações trabalhistas/fiscais exigem avaliação jurídica e contábil. A mudança do nome não descaracteriza, por si só, eventual vínculo trabalhista.

## Estrutura resumida

```text
nexa-vet-control/
├── index.html, styles.css, extra.css
├── app.js                 # interface, validações e fluxos
├── demo.js                # demonstração fictícia local
├── config.js              # URL e chave pública
├── sw.js, manifest.webmanifest, assets/
├── supabase/schema.sql    # banco NOVO (sem dados de ponto)
├── supabase/config.toml
└── supabase/functions/nexa-api/index.ts
```

**Nexa Studio — 2026. Versão 2.0 — Solicitações de horas adicionais.**
