# Meu Saldo — Controle de gastos

Aplicação pessoal de controle financeiro feita em HTML, CSS e JavaScript, sem conta ou servidor de dados. A interface adapta-se a celular e desktop.

## Executar

Na pasta do projeto, inicie um servidor estático:

```bash
python3 -m http.server 3000
```

Depois, abra `http://localhost:3000`. O app também pode ser servido por Live Server ou hospedagem estática.

## Tela de acesso demonstrativa

O site mostra telas visuais de cadastro (nome, e-mail, senha e CPF) e entrada (e-mail e senha), mas não possui autenticação nem contas. Use somente dados fictícios: os campos não são enviados nem salvos pelo site e são limpos ao abrir o painel. O painel financeiro continua guardando lançamentos no `localStorage` deste navegador, sem proteção por senha e sem sincronização.

## O que dá para fazer

- Registrar, editar, excluir e filtrar receitas e despesas por mês, tipo, categoria ou descrição.
- Acompanhar o saldo previsto, totais do período, movimentações pendentes e gráficos de categorias e de seis meses.
- Criar compras parceladas pelo menu de parcelas ou pelo atalho no cadastro de despesas: o app gera os vencimentos mensais, distribui possíveis centavos restantes e permite marcar pagamentos.
- Consultar uma planilha de parcelas: cada compra tem sua linha, doze meses são exibidos por vez com valor/número/situação de cada vencimento e os totais mensais; a tabela se atualiza ao adicionar, pagar ou excluir parcelas.
- Conferir a estimativa da fatura do cartão no mês selecionado e o saldo projetado antes e depois de pagá-la.
- Definir orçamentos por categoria e mês, com indicadores de uso e alertas quando o limite é excedido.
- Ver alertas de contas atrasadas ou com vencimento nos próximos sete dias.
- Baixar uma cópia JSON dos dados ou apagar os dados armazenados.

## Dados e lembretes

Os registros ficam no `localStorage` do navegador e do dispositivo atual. Não há sincronização entre dispositivos; exporte uma cópia JSON para guardar um backup. Apagar os dados do navegador também apaga os registros que ainda não foram exportados.

A fatura estimada soma as despesas com pagamento em cartão de crédito cuja data está no mês selecionado, inclusive as parcelas com vencimento nesse mês. Ao lançar uma despesa comum no crédito, informe a data em que ela deve entrar na fatura; ao parcelar, informe o primeiro vencimento. O saldo após pagar é uma projeção dos lançamentos cadastrados, não uma consulta ao banco ou à operadora.

As notificações do navegador são opcionais: use **Lembretes** e conceda permissão. Por ser uma aplicação local, os lembretes automáticos são verificados enquanto a página estiver aberta; os alertas visuais ficam disponíveis dentro do painel.
