# Nexa Vet Control v1.2 — Instalável em celular e tablet (PWA)

# NEXA VET CONTROL v1.1 — plataforma de serviços e pagamentos PJ

Sistema web independente da Nexa Studio, com design responsivo em preto e dourado, tela de abertura animada, autenticação, painel da clínica, terminal de PIN + foto, histórico de prestação de serviços e fechamento financeiro.

## 1. O que está incluído

- **Proprietária e administrativo:** logins individuais com **as mesmas permissões** operacionais, visualização de horas, relatórios, valores, ajustes e aprovações.
- **Profissionais PJ:** a clínica cria os logins, senhas temporárias e PINs de 6 números; cada profissional altera a própria senha no primeiro acesso e pode consultar seus registros e comunicar divergências (mas não corrigir horas).
- **Registro pelo login pessoal:** nova opção **Registrar ponto** no menu de cada profissional. Digita o próprio PIN, fotografa ao vivo e confirma entrada/saída. **Esses registros ficam pendentes de conferência administrativa após a saída e não entram no pagamento antes da validação pelas câmeras.** É uma alternativa de registro, mas **não comprova presença física**: pode ser usada fora da clínica, portanto usar preferencialmente o terminal fixo.
- **Terminal da recepção:** login exclusivo no celular fixo. Cada profissional digita PIN e tira uma **foto ao vivo** na entrada e na saída. O servidor define data/hora; não se pode enviar foto da galeria pela interface.
- **Conferência:** ajustes manuais de horários exigem justificativa, ficam pendentes e só entram no cálculo após confirmação administrativa da conferência das câmeras. Há trilha de auditoria com dados anteriores e posteriores.
- **Financeiro:** a clínica informa a tarifa horária individual e escolhe o dia de fechamento. Cada registro mantém uma cópia do valor/hora aplicado; aprovações têm horário e usuário identificados. Períodos ainda abertos não podem ser aprovados no backend.
- **Relatórios:** painel geral, histórico por profissional, cálculo por fechamento, exportação CSV e impressão em PDF pelo navegador.
- **Proteção no backend:** autenticação Supabase Auth, função autorizadora no servidor, isolamento via RLS nas tabelas, fotos em bucket privado, limite de tentativas do PIN, registro de auditoria e bloqueio de períodos aprovados.

**Atenção:** o projeto contém uma **demonstração funcional local** e uma **estrutura de produção baseada no Supabase**. A versão de produção ainda precisará ser configurada, implantada, testada no ambiente real e passar por revisão de LGPD/contratos. A demonstração não é adequada para dados reais.

## 2. Testar agora, sem instalar nada

1. Descompacte o arquivo `.zip`.
2. Abra `index.html` no Chrome, Edge ou Safari. Se o navegador bloquear recursos locais, publique os arquivos em um servidor estático (por exemplo, GitHub Pages) ou rode `python -m http.server 8000` nesta pasta.
3. Na tela de login, toque em **Dona**, **Profissional** ou **Terminal** para visitar a demonstração.
4. Entre como **Profissional** e clique em **Registrar ponto** no menu (ou no cartão da página inicial). Digite o PIN de demonstração `158236`, use a câmera ou a simulação de foto da demonstração e confirme a entrada ou saída. Os registros ficam visíveis no histórico e, após a saída, pendentes de conferência.
5. Experimente cadastrar um profissional, alterar a tarifa e o dia de fechamento, usar o terminal e solicitar correção.

A demonstração utiliza dados **fictícios** e os mantém no `localStorage` do navegador. Se você limpar o armazenamento, a demonstração volta ao estado inicial. Não há sincronização entre aparelhos nessa modalidade.

**Contas fictícias:**

| Papel | E-mail | Senha |
|---|---|---|
| Proprietária | `dona@demo.nexa` | `Demo@1234` |
| Administrativo | `financeiro@demo.nexa` | `Demo@1234` |
| Profissional | `ana@demo.nexa` | `Demo@1234` |
| Terminal | `terminal@demo.nexa` | `Demo@1234` |

PIN fictício da Ana: `158236`. PIN fictício do Carlos: `729415`.

**Somente na demonstração:** se o navegador não fornecer câmera, existe um botão explícito para simular uma imagem. **No sistema real, o servidor exige JPEG válido e o botão de simulação não aparece.** A fotografia ajuda a conferir a identidade, mas não constitui prova infalível de quem estava presente; não há reconhecimento facial nem detecção automática de fraude.

## 3. Preparar o Supabase para uso real

### Etapa A — projeto e SQL

1. Crie um **projeto Supabase exclusivo da clínica**. Recomenda-se que a **proprietária seja titular** do projeto e controle as permissões dos colaboradores técnicos.
2. Entre em **Supabase > SQL Editor** e execute **todo o arquivo** `supabase/schema.sql` em um projeto novo.
3. No **Authentication**, desabilite o autocadastro público e configure as regras de senha, recuperação e proteção de contas adequadas.
4. No **Authentication > Users > Add user**, crie a **conta da proprietária** e confirme seu e-mail.
5. Copie o UUID dela e, no SQL Editor, execute:

```sql
insert into public.profiles (id, full_name, email, role)
values (
  'COLE-AQUI-O-UUID-DA-PROPRIETARIA',
  'Nome da proprietária',
  'email.real@clinica.com.br',
  'owner'
);
```

6. No **Storage**, confirme que o bucket `vet-clock-photos` existe e é **privado**. Não crie políticas de leitura pública.

### Etapa B — implantar função do servidor

Instale a CLI do Supabase, autentique e conecte o projeto (a documentação oficial cobre os diferentes sistemas operacionais). Na raiz desta pasta, execute:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set NEXA_PIN_PEPPER="COLOQUE-AQUI-UM-SEGREDO-ALEATORIO-FORTE-COM-32-OU-MAIS-CARACTERES"
supabase functions deploy nexa-api
```

O **NEXA_PIN_PEPPER** é necessário para calcular os HMACs dos PINs no servidor. Guarde-o de maneira segura; **não o coloque em `config.js` ou no GitHub**. Nunca exponha a chave `service_role`, `sb_secret_*` ou qualquer segredo de administrador no navegador.

A função lê automaticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente Supabase. Confira essas variáveis na instalação. Se não estiverem disponíveis, providencie-as como segredos do ambiente.

### Etapa C — configurar o frontend

Edite `config.js` com a URL do projeto e sua chave **pública/publishable**:

```js
window.NEXA_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_CHAVE_PUBLICA',
  functionName: 'nexa-api',
};
```

**Só coloque a chave pública no JavaScript.** A permissão real de leitura e alteração de dados é definida pela Edge Function e pelas tabelas protegidas, não pela interface.

### Etapa D — publicar em HTTPS

Pode hospedar `index.html`, `styles.css`, `app.js`, `demo.js`, `config.js`, `manifest.webmanifest` e a pasta `assets/` em **GitHub Pages** ou outro servidor estático com HTTPS. O diretório `supabase/` é material de implantação do backend e não precisa ser servido no site.

Use uma URL HTTPS para o celular da recepção permitir a câmera. Entre com a proprietária; no painel **Configurações**, cadastre o administrativo e o terminal; em **Profissionais**, cadastre cada prestador com e-mail, senha inicial, PIN e tarifa.

**Recomendação:** bloqueie o celular no app/site com um modo quiosque apropriado, controle quem pode acessar fisicamente o aparelho e use internet estável. Um PIN + selfie não impede, por si só, fraude ou falsificação da imagem.

## 4. Fluxo real sugerido

1. Dona/financeiro entra com seu e-mail e senha próprios.
2. A proprietária configura o nome da clínica e o dia de fechamento.
3. Dona/financeiro cadastra cada PJ, tarifa horária, PIN e senha inicial.
4. O PJ troca a senha no primeiro login. No celular da recepção, usa o PIN + fotografia para entrada e saída.
5. Se esquecer alguma marcação, o PJ informa a divergência, mas **não edita horas**. O administrativo registra a correção manual com justificativa e atesta a conferência pelas câmeras.
6. Após o dia de fechamento, o financeiro revisa o período e aprova a apuração individual. O valor aprovado não muda com edições posteriores daquele período.
7. A clínica emite os documentos fiscais e efetua pagamentos conforme os contratos, fora da plataforma (não há integração bancária/nota fiscal nesta versão).

## 5. Estrutura do projeto

```text
nexa-vet-control/
├── index.html                     # abertura, login e estrutura
├── styles.css                     # identidade visual Nexa
├── app.js                         # telas e regras de interação
├── demo.js                        # demonstração local fictícia
├── config.js                      # URL e chave PÚBLICA Supabase
├── manifest.webmanifest           # atalho para tela inicial do celular
├── assets/favicon.svg
└── supabase/
    ├── schema.sql                 # banco, restrições e storage
    └── functions/nexa-api/index.ts # operações seguras no servidor
```

## 6. Privacidade e aspectos jurídicos (antes de usar)

- A fotografia da pessoa é **dado pessoal** e exige informação transparente sobre finalidade, acesso, base legal, retenção e segurança. Defina com a clínica e o responsável jurídico a **política de privacidade**, prazo de retenção e procedimento de descarte; o pacote ainda **não automatiza o descarte das imagens**.
- O app não implementa reconhecimento facial e não possui detecção biométrica de identidade. O nome e foto do registro não são comprovação automática infalível; mantenha a conferência com câmeras e outras evidências quando houver dúvidas.
- Medir horas de prestadores **PJ** pode elevar o risco de caracterização de vínculo de emprego dependendo da prática de trabalho, subordinação e contrato. A clínica deve consultar seu jurídico/contabilidade e tratar os registros como controle de serviços contratados, não presumir que trocar o nome "ponto" resolve essa questão.
- Para evitar que o desenvolvedor tenha acesso aos **valores individuais**, a clínica deve controlar seu próprio Supabase e não fornecer ao desenvolvedor a chave de serviço ou permissões de banco de dados após a configuração. Ocultar valores na interface NÃO é suficiente se alguém mantém acesso ao backend.
- Antes de pôr em uso: realizar testes com usuários reais autorizados (mas dados de teste), revisar permissões, definir backup, contingência de internet/câmera, recuperação de senha, retenção das fotos e rotina de monitoramento.

---

**Nexa Studio & Publicidade** · Projeto NEXA VET CONTROL · Primeira versão para apresentação e implantação orientada.

## Atualização 1.1 — Marcação no login pessoal

- O profissional agora tem o menu **Registrar ponto**, além de **Meus registros**, **Minhas solicitações** e **Minha conta**.
- A função de produção `worker_clock` recebe apenas registros da própria conta autenticada, valida o PIN no servidor, exige imagem JPEG e guarda fotografias no bucket privado. O servidor atribui a hora.
- Registros via conta pessoal, após a saída, são marcados `pending_review` e exigem aprovação com conferência das câmeras antes de entrar no pagamento.
- **Limite importante:** PIN e selfie não garantem que o profissional esteja dentro da clínica. Se o registro tiver de ocorrer *exclusivamente* na recepção, use o terminal fixo como único canal ou implante, antes do uso real, um controle adicional de aparelho autorizado com validação no servidor.
- Depois de substituir os arquivos no site, também é necessário **implantar a Edge Function atualizada** (`supabase functions deploy nexa-api`). Apenas publicar `app.js` não ativa o novo registro no Supabase.


## Atualização 1.2 — Aplicativo instalável (PWA)

O sistema foi adaptado para **celulares Android, iPhone/iPad e tablets**: menu fixo inferior em telas de até 900 px, área de toque ampliada, formulários e modais adequados à tela pequena, ícones PNG, layout de tela cheia e suporte ao comando "Instalar aplicativo".

### Instalar após publicar em HTTPS

- **Android (Chrome/Edge):** abra a URL publicada, toque em **Instalar no celular ou tablet** ou no menu do navegador **Instalar aplicativo / Adicionar à tela inicial**. Confirme e abra pelo ícone **Nexa Vet**.
- **iPhone / iPad (Safari):** abra a URL publicada, toque em **Compartilhar** → **Adicionar à Tela de Início**. Abra pelo novo ícone na tela inicial. O instalador de iOS não usa o mesmo prompt do Chrome.
- **Computador (Chrome/Edge):** pode instalar pelo botão de instalação do navegador quando oferecido.
- **Teste local:** `file://` não habilita Service Worker e nem instalação de PWA. Para testar em um computador, use `python -m http.server 8000` na pasta e abra `http://localhost:8000`. Em celulares, use uma hospedagem HTTPS real.

**Atenção:** `sw.js` armazena apenas os arquivos estáticos da interface. **Não armazena fotos, sessões de login nem respostas do Supabase para uso offline.** Na ausência de internet, o aplicativo pode abrir sua interface anteriormente carregada, mas NÃO registra ponto, NÃO autentica e NÃO sincroniza dados reais; nenhuma marcação fica em fila escondida. O servidor continua sendo responsável por atribuir o horário de registro e guardar as evidências. O modo demonstração permanece local e fictício.

### Publicação da versão 1.2

1. Atualize **todos** os arquivos da raiz, especialmente `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js` e `assets/icon-*.png`.
2. Publique em HTTPS com `manifest.webmanifest` servido como tipo apropriado. Se o domínio já tinha a versão antiga instalada, feche e reabra o app para receber a atualização; em alguns casos, será necessário atualizar a página ou reinstalar.
3. Configure `config.js` e publique o backend Supabase seguindo a seção 3 do manual. Os recursos administrativos e registros reais só funcionarão quando implantados.
4. No celular da recepção, instale o app e entre com a conta **Terminal** (o sistema não bloqueia automaticamente outros navegadores nem certifica o aparelho; recomenda-se modo quiosque/gerenciamento do dispositivo).

**Escopo:** PWA instalável, não um APK/IPA nativo. A capacidade de instalar depende do navegador, HTTPS e permissões do sistema operacional. Sem conexão o fluxo real de marcação não pode ser concluído.
