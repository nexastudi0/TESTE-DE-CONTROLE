# Roteiro de validação — Nexa Vet 2.0

## Demonstração

- [ ] Login simulado como dona, financeiro e profissional.
- [ ] Profissional pede horas adicionais informando início, término e motivo (>=15 caracteres).
- [ ] Pedido aparece como "Aguardando análise" sem exibir tarifa ao profissional.
- [ ] Não permitir hora de término futura, duração maior que 16h ou intervalo sobreposto.
- [ ] Administração abre pedido, aprova e confere o histórico.
- [ ] Administração recusa pedido com justificativa obrigatória.
- [ ] Administração corrige um pedido pendente com justificativa obrigatória e gera auditoria.
- [ ] Alterar valor por hora só afeta novos pedidos; histórico mantém a tarifa anterior.
- [ ] Criar profissional com senha temporária e trocar senha no primeiro acesso.
- [ ] Criar login do financeiro com permissão administrativa equivalente à dona.
- [ ] Alterar o dia do fechamento mensal; conferir limites 1 a 28.
- [ ] No financeiro, apenas horas aprovadas entram no valor, pedidos pendentes bloqueiam fechamento.
- [ ] Exportar CSV, imprimir relatório, conferir menu inferior e campos no celular/tablet.

## Antes de usar com dados reais

- [ ] Banco SQL em projeto Supabase NOVO e conta dona inicial criada.
- [ ] Edge Function implantada; APP_ORIGIN e autenticação verificados.
- [ ] Cadastrado profissional real de teste; login, alteração de senha e saída.
- [ ] Validado que profissional não recebe tarifa de nenhum usuário nem solicitações de terceiros.
- [ ] Validado que profissional não pode aprovar, recusar, editar tarifas ou aprovar pagamento.
- [ ] Testado fechamento vencido e fechamento aberto, inclusive mudança de mês e fevereiro.
- [ ] Testadas duas aprovações simultâneas, conflito de registro e apuração concorrente.
- [ ] Definidos backups, recuperação de conta, políticas de retenção e proteção de dados.
- [ ] Revisão jurídica e contábil do contrato de serviços PJ concluída.

**Não considerar o ambiente em produção até concluir os testes de integração.**

## Checklist visual v2.1

- [ ] Splash exibe o ícone dourado 3D.
- [ ] Login e menus exibem a marca 3D sem cortes.
- [ ] Solicitação de horas adicionais permanece funcional.
- [ ] Administração consegue analisar, corrigir e aprovar solicitações.
- [ ] Menu móvel e botões continuam acessíveis.
- [ ] PWA usa novos ícones, inclusive maskable, depois de reinstalar.
- [ ] Efeitos não interferem com a opção de movimento reduzido.
