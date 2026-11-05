# Roteiro de testes antes da entrega à clínica

- [ ] Conta da proprietária abre o painel e não pode ver dados sem login.
- [ ] Administrativo entra com senha diferente e vê exatamente os mesmos módulos.
- [ ] Proprietária cadastra PJ com valor/hora individual, PIN de seis números e senha inicial.
- [ ] Profissional é obrigado a trocar a senha provisória e consegue acessar somente o próprio histórico.
- [ ] Profissional não consegue cadastrar outros usuários, ver valores ou modificar registros (testar também chamadas diretas à Edge Function).
- [ ] Terminal abre apenas a tela de PIN, exige foto real e não exibe valores ou relatórios.
- [ ] PIN incorreto falha e cinco tentativas incorretas bloqueiam novas tentativas por 15 minutos.
- [ ] Registro de entrada grava foto e horário do servidor; saída encerra a sessão.
- [ ] Em tentativa de criar serviços sobrepostos, o banco bloqueia o segundo registro.
- [ ] Alteração manual grava motivo, horário anterior/novo e usuário no log de auditoria.
- [ ] Registro modificado não entra em pagamento antes de atestar a conferência das câmeras.
- [ ] Fechamento ainda aberto impede aprovação; após fechamento e sem pendências permite aprovar.
- [ ] Período aprovado não permite ajustes ou inclusão de sessões.
- [ ] Alterar valor/hora de PJ não muda valor dos serviços anteriores.
- [ ] Troca de dia de fechamento é bloqueada se já há aprovações registradas.
- [ ] Fotos somente são acessadas por proprietária/administrativo por links temporários.
- [ ] CSV, relatórios e impressão conferem com a soma dos registros válidos.
- [ ] Testar em Android/iPhone (HTTPS), câmera frontal, baixa conexão e recusa de permissão da câmera.
- [ ] Revisar LGPD, contrato de prestação de serviço, backup, retenção e recuperação de acesso.

## Atualização 1.1 — Área de marcação dentro do login do funcionário

- [x] Login de Ana (modo demonstração) apresenta **Registrar ponto** no menu, no cabeçalho e no cartão de ação.
- [x] A página de marcação permite PIN de 6 dígitos e captura/simulação de foto.
- [x] Entrada confirmada pelo próprio login cria um serviço aberto, identificado apenas como pertencente ao usuário autenticado.
- [x] Saída confirmada fecha o serviço e o marca **A conferir**, sem inclusão entre as horas válidas para pagamento.
- [x] O histórico pessoal mostra o novo registro e seu status.
- [x] A conta da proprietária enxerga o registro pendente para verificação posterior.
- [x] Layout móvel não apresenta rolagem lateral em tela de 390px, com controles acessíveis.
- [ ] Produção: publicar código e implantar `nexa-api`, testar câmera real em HTTPS, banco Supabase, bucket privado, RLS e fluxo financeiro da clínica.
- [ ] Produção: definir se os registros pessoais feitos fora do terminal continuarão habilitados ou se será implementada vinculação segura ao dispositivo da recepção.


## Versão 1.2 — Testes de dispositivo / instalação

- [ ] Verificar login da dona e profissional em 375x812 e 820x1180, sem rolagem horizontal global.
- [ ] Verificar abas inferiores, ícones ativos, toque e abertura do menu "Mais" (admin).
- [ ] Verificar tela de PIN e câmera com rolagem e teclado virtual sem bloquear botões.
- [ ] Validar `manifest.webmanifest`, PNG 192/512 e registro de `sw.js` em HTTPS/localhost.
- [ ] Instalar pelo Chrome Android e pelo Safari iOS; conferir nome/ícone e tela cheia.
- [ ] Ativar modo avião: deve exibir aviso e impedir qualquer registro real; não criar marcações pendentes offline.
- [ ] Atualizar arquivos e verificar atualização do cache; não cachear requisições do Supabase.
- [ ] Confirmar permissões reais com autenticação e backend no Supabase antes de uso na clínica.
