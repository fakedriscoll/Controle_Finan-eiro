import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMWU69p4XZFvAmd2fNoaDHdWnKO-X9Sg0",
  authDomain: "controle-de-gastos-9d4ab.firebaseapp.com",
  databaseURL: "https://controle-de-gastos-9d4ab-default-rtdb.firebaseio.com",
  projectId: "controle-de-gastos-9d4ab",
  storageBucket: "controle-de-gastos-9d4ab.firebasestorage.app",
  messagingSenderId: "533724485556",
  appId: "1:533724485556:web:30d5ff9921f2a5b5ea04e1",
  measurementId: "G-RQNG84JNL7"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

(() => {
  'use strict';

  const STORAGE_KEY = 'meu-saldo-dados-v1';
  const categories = {
    income: [
      { id: 'salario', label: 'Salário', icon: '▤' },
      { id: 'freelance', label: 'Freelance', icon: '✳' },
      { id: 'investimentos', label: 'Investimentos', icon: '↗' },
      { id: 'vendas', label: 'Vendas', icon: '◇' },
      { id: 'outros', label: 'Outros', icon: '···' }
    ],
    expense: [
      { id: 'moradia', label: 'Moradia', icon: '⌂' },
      { id: 'alimentacao', label: 'Alimentação', icon: '◒' },
      { id: 'transporte', label: 'Transporte', icon: '↗' },
      { id: 'saude', label: 'Saúde', icon: '＋' },
      { id: 'educacao', label: 'Educação', icon: '▤' },
      { id: 'lazer', label: 'Lazer', icon: '✳' },
      { id: 'contas', label: 'Contas', icon: '▣' },
      { id: 'compras', label: 'Compras', icon: '◇' },
      { id: 'assinaturas', label: 'Assinaturas', icon: '◷' },
      { id: 'outros', label: 'Outros', icon: '···' }
    ]
  };
  const chartColors = ['#72a983', '#e6a77f', '#e5c565', '#86a8bd', '#b19bc6', '#8fc4b7', '#d98773', '#a5b375', '#84a5a0', '#c6a37a'];
  const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const monthLong = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function newId() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `ms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function localMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function dateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function makeEmptyState() {
    return { transactions: [], installments: [], budgets: [], settings: { notificationsEnabled: false, lastNotificationDay: '' } };
  }
  function normalizeState(saved) {
    if (!saved || typeof saved !== 'object') return makeEmptyState();
    return {
      transactions: Array.isArray(saved.transactions) ? saved.transactions : [],
      installments: Array.isArray(saved.installments) ? saved.installments : [],
      budgets: Array.isArray(saved.budgets) ? saved.budgets : [],
      settings: { ...makeEmptyState().settings, ...(saved.settings || {}) }
    };
  }

  async function loadState() {
    const user = auth.currentUser;
    if (!user) return makeEmptyState();

    try {
      const snapshot = await get(ref(db, `users/${user.uid}/state`));
      return normalizeState(snapshot.exists() ? snapshot.val() : null);
    } catch (error) {
      console.error('Não foi possível carregar os dados do Firebase.', error);
      showToast('Não foi possível carregar seus dados da nuvem.');
      return makeEmptyState();
    }
  }

  let state = makeEmptyState();
  let selectedMonth = localMonth();
  let installmentWindowOffset = 0;
  let activeView = 'dashboard';
  let selectedTransactionType = 'expense';
  let toastTimer;
  let confirmationResolve = null;

  async function saveState() {
    const user = auth.currentUser;
    if (!user) {
      showToast('Sua sessão não está autenticada. Entre novamente para salvar os dados.');
      return false;
    }

    try {
      await set(ref(db, `users/${user.uid}/state`), state);
      return true;
    } catch (error) {
      console.error('Não foi possível salvar os dados no Firebase.', error);
      const detail = error?.code === 'PERMISSION_DENIED'
        ? 'Permissão negada no Realtime Database. Verifique se você está logado e se as regras permitem users/SEU_UID/state.'
        : (error?.message || 'Erro desconhecido.');
      showToast(`Não foi possível salvar: ${detail}`);
      return false;
    }
  }
  function money(value, compact = false) {
    const amount = Number(value) || 0;
    if (compact && Math.abs(amount) >= 100000) {
      return `R$ ${(amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    }
    return currencyFormatter.format(amount);
  }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function parseLocalDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  function formatDate(value) {
    const parsed = parseLocalDate(value);
    return parsed ? dateFormatter.format(parsed).replace('.', '') : '—';
  }
  function monthTitle(month) {
    const [year, number] = month.split('-').map(Number);
    return monthLong.format(new Date(year, number - 1, 1, 12));
  }
  function categoryInfo(id, type = 'expense') {
    return categories[type].find(category => category.id === id)
      || [...categories.income, ...categories.expense].find(category => category.id === id)
      || { id: 'outros', label: 'Outros', icon: '···' };
  }
  function monthOf(value) { return String(value || '').slice(0, 7); }
  function inSelectedMonth(transaction) { return monthOf(transaction.date) === selectedMonth; }
  function selectedTransactions(type = null) {
    return state.transactions.filter(item => inSelectedMonth(item) && (!type || item.type === type));
  }
  function sum(list) { return list.reduce((total, item) => total + (Number(item.amount) || 0), 0); }
  function expensesInMonth(month, category = null) {
    return state.transactions.filter(item => item.type === 'expense' && monthOf(item.date) === month && (!category || item.category === category));
  }
  function displayName(categoryId) {
    const info = [...categories.income, ...categories.expense].find(category => category.id === categoryId);
    return info ? info.label : 'Outros';
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
  }
  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
  }
  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function finishConfirmation(confirmed) {
    const resolve = confirmationResolve;
    confirmationResolve = null;
    closeDialog('confirmationDialog');
    if (resolve) resolve(confirmed);
  }
  function askForConfirmation({ title, message, confirmLabel = 'Excluir' }) {
    const dialog = $('#confirmationDialog');
    if (!dialog || typeof dialog.showModal !== 'function') {
      showToast('Este navegador não permite abrir a confirmação de exclusão.');
      return Promise.resolve(false);
    }
    if (confirmationResolve) finishConfirmation(false);
    $('#confirmationTitle').textContent = title;
    $('#confirmationMessage').textContent = message;
    $('#confirmationAccept').textContent = confirmLabel;
    return new Promise(resolve => {
      confirmationResolve = resolve;
      dialog.showModal();
      $('#confirmationCancel').focus();
    });
  }

  function fillSelect(select, list, selected = null) {
    if (!select) return;
    const previous = selected ?? select.value;
    select.innerHTML = list.map(item => `<option value="${safeText(item.id)}">${safeText(item.label)}</option>`).join('');
    if (list.some(item => item.id === previous)) select.value = previous;
  }
  function updateTransactionDateLabel() {
    const label = $('#transactionDateLabel');
    if (!label) return;
    const isCreditCard = selectedTransactionType === 'expense' && $('#transactionPayment').value === 'Cartão de crédito';
    label.textContent = isCreditCard ? 'Data que entra na fatura' : 'Data';
  }
  function handleTransactionPaymentChange() {
    updateTransactionDateLabel();
    if (!$('#transactionId').value && $('#transactionPayment').value === 'Cartão de crédito') {
      $('#transactionStatus').value = 'pending';
    }
  }
  function setTransactionType(type) {
    selectedTransactionType = type;
    $$('[data-transaction-type]').forEach(button => button.classList.toggle('active', button.dataset.transactionType === type));
    const income = type === 'income';
    $('#transactionDialogTitle').textContent = $('#transactionId').value ? 'Editar movimentação' : `Adicionar ${income ? 'receita' : 'despesa'}`;
    $('#paymentField').hidden = income;
    $('#statusLabel').textContent = 'Situação';
    const status = $('#transactionStatus');
    status.options[0].textContent = income ? 'Recebida' : 'Paga';
    status.options[1].textContent = income ? 'A receber' : 'Pendente';
    fillSelect($('#transactionCategory'), categories[type]);
    updateTransactionDateLabel();
    $('#installmentShortcut').hidden = income || Boolean($('#transactionId').value);
  }
  function openTransactionForm(type = 'expense', transaction = null) {
    const form = $('#transactionForm');
    form.reset();
    $('#transactionId').value = transaction?.id || '';
    $('#transactionError').hidden = true;
    setTransactionType(transaction?.type || type);
    $('#transactionDescription').value = transaction?.description || '';
    $('#transactionAmount').value = transaction ? Number(transaction.amount).toFixed(2) : '';
    $('#transactionDate').value = transaction?.date || dateString();
    $('#transactionPayment').value = transaction?.payment || 'Pix';
    const defaultStatus = selectedTransactionType === 'expense' && $('#transactionPayment').value === 'Cartão de crédito' ? 'pending' : 'paid';
    $('#transactionStatus').value = transaction?.status || defaultStatus;
    fillSelect($('#transactionCategory'), categories[transaction?.type || type], transaction?.category || null);
    updateTransactionDateLabel();
    openDialog('transactionDialog');
    window.setTimeout(() => $('#transactionDescription').focus(), 50);
  }
  async function saveTransaction(event) {
    event.preventDefault();
    const description = $('#transactionDescription').value.trim();
    const amount = Number($('#transactionAmount').value);
    const date = $('#transactionDate').value;
    const category = $('#transactionCategory').value;
    const error = $('#transactionError');
    if (!description || !Number.isFinite(amount) || amount <= 0 || !parseLocalDate(date)) {
      error.textContent = 'Preencha a descrição, um valor maior que zero e uma data válida.';
      error.hidden = false;
      return;
    }

    const id = $('#transactionId').value;
    const existing = id ? state.transactions.find(item => item.id === id) : null;
    const previousState = JSON.parse(JSON.stringify(state));
    const transaction = {
      id: existing?.id || newId(),
      type: selectedTransactionType,
      description,
      amount: Math.round(amount * 100) / 100,
      date,
      category,
      payment: selectedTransactionType === 'income' ? '' : $('#transactionPayment').value,
      status: $('#transactionStatus').value,
      installmentId: existing?.installmentId || null,
      installmentIndex: existing?.installmentIndex || null
    };

    if (existing) state.transactions = state.transactions.map(item => item.id === id ? transaction : item);
    else state.transactions.unshift(transaction);

    const saved = await saveState();
    if (!saved) {
      state = previousState;
      return;
    }

    closeDialog('transactionDialog');
    render();
    showToast(existing ? 'Movimentação atualizada e salva na nuvem.' : `${selectedTransactionType === 'income' ? 'Receita' : 'Despesa'} adicionada e salva na nuvem.`);
  }

  function addMonths(dateText, offset) {
    const source = parseLocalDate(dateText);
    if (!source) return dateText;
    const desiredDay = source.getDate();
    const target = new Date(source.getFullYear(), source.getMonth() + offset, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
    target.setDate(Math.min(desiredDay, lastDay));
    return dateString(target);
  }
  function updateInstallmentPreview() {
    const total = Number($('#installmentAmount').value);
    const count = Number($('#installmentCount').value);
    const paid = Number($('#installmentPaid').value) || 0;
    const preview = $('#installmentPreview');
    if (!(total > 0) || !(count >= 2)) {
      preview.textContent = 'Informe o total e a quantidade para ver o valor de cada parcela.';
      return;
    }
    const each = total / count;
    preview.textContent = `${count} parcelas de aproximadamente ${money(each)} · ${paid} já ${paid === 1 ? 'paga' : 'pagas'} · ${count - paid} ${count - paid === 1 ? 'restante' : 'restantes'}.`;
  }
  function openInstallmentForm(prefill = null) {
    $('#installmentForm').reset();
    $('#installmentDescription').value = prefill?.description || '';
    $('#installmentAmount').value = prefill?.amount || '';
    $('#installmentDate').value = dateString();
    $('#installmentPaid').value = '0';
    $('#installmentCount').value = '6';
    $('#installmentError').hidden = true;
    fillSelect($('#installmentCategory'), categories.expense, prefill?.category || null);
    $('#installmentPayment').value = prefill?.payment || 'Cartão de crédito';
    updateInstallmentPreview();
    openDialog('installmentDialog');
  }
  function openInstallmentFromExpense() {
    const prefill = {
      description: $('#transactionDescription').value.trim(),
      amount: $('#transactionAmount').value,
      category: $('#transactionCategory').value,
      payment: $('#transactionPayment').value
    };
    closeDialog('transactionDialog');
    openInstallmentForm(prefill);
  }
  async function saveInstallment(event) {
    event.preventDefault();
    const description = $('#installmentDescription').value.trim();
    const total = Math.round(Number($('#installmentAmount').value) * 100);
    const count = Number($('#installmentCount').value);
    const firstDate = $('#installmentDate').value;
    const paidCount = Number($('#installmentPaid').value);
    const error = $('#installmentError');
    if (!description || !Number.isFinite(total) || total < 1 || !Number.isInteger(count) || count < 2 || count > 60 || !parseLocalDate(firstDate) || !Number.isInteger(paidCount) || paidCount < 0 || paidCount > count) {
      error.textContent = 'Confira a descrição, o valor, os vencimentos e a quantidade de parcelas já pagas.';
      error.hidden = false;
      return;
    }

    const previousState = JSON.parse(JSON.stringify(state));
    const id = newId();
    const eachBase = Math.floor(total / count);
    const remainder = total % count;
    const transactions = [];
    for (let index = 0; index < count; index += 1) {
      const cents = eachBase + (index < remainder ? 1 : 0);
      transactions.push({
        id: newId(),
        type: 'expense',
        description: `${description} (${index + 1}/${count})`,
        amount: cents / 100,
        date: addMonths(firstDate, index),
        category: $('#installmentCategory').value,
        payment: $('#installmentPayment').value,
        status: index < paidCount ? 'paid' : 'pending',
        installmentId: id,
        installmentIndex: index + 1
      });
    }

    state.installments.push({
      id,
      description,
      total: total / 100,
      count,
      paidCount,
      category: $('#installmentCategory').value,
      payment: $('#installmentPayment').value,
      firstDate,
      transactionIds: transactions.map(item => item.id)
    });
    state.transactions.push(...transactions);

    const saved = await saveState();
    if (!saved) {
      state = previousState;
      return;
    }

    closeDialog('installmentDialog');
    render();
    showToast(`Parcelamento criado: ${paidCount} de ${count} parcelas já pagas.`);
  }

  function setPage(view) {
    if (!['dashboard', 'transactions', 'installments', 'budgets'].includes(view)) return;
    activeView = view;
    document.querySelectorAll('.page-view').forEach(section => { section.hidden = section.id !== `${view}View`; });
    $$('.nav-link[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const names = { dashboard: 'Visão geral', transactions: 'Movimentações', installments: 'Parcelamentos', budgets: 'Orçamentos' };
    $('#breadcrumbCurrent').textContent = names[view];
    $('#sidebar').classList.remove('open');
    $('#menuToggle').setAttribute('aria-expanded', 'false');
    if (view === 'transactions') renderTransactions();
    if (view === 'installments') renderInstallments();
    if (view === 'budgets') renderBudgets();
  }
  function getAlertItems() {
    const today = parseLocalDate(dateString());
    const result = [];
    state.transactions.filter(item => item.type === 'expense' && item.status !== 'paid').forEach(item => {
      const due = parseLocalDate(item.date);
      if (!due) return;
      const dayDelta = Math.round((due - today) / 86400000);
      if (dayDelta < 0) result.push({ kind: 'overdue', item, delta: dayDelta });
      else if (dayDelta <= 7) result.push({ kind: 'due', item, delta: dayDelta });
    });
    state.budgets.filter(item => item.month === selectedMonth).forEach(budget => {
      const spent = sum(expensesInMonth(selectedMonth, budget.category));
      if (spent > Number(budget.limit)) result.push({ kind: 'overbudget', budget, spent });
    });
    return result.sort((a, b) => {
      const weight = { overdue: 0, due: 1, overbudget: 2 };
      return weight[a.kind] - weight[b.kind] || (a.delta || 0) - (b.delta || 0);
    });
  }
  function alertText(alert) {
    if (alert.kind === 'overdue') return `A despesa <strong>${safeText(alert.item.description)}</strong> venceu em ${safeText(formatDate(alert.item.date))}.`;
    if (alert.kind === 'due') {
      const when = alert.delta === 0 ? 'vence hoje' : alert.delta === 1 ? 'vence amanhã' : `vence em ${alert.delta} dias`;
      return `A despesa <strong>${safeText(alert.item.description)}</strong> ${when}.`;
    }
    const budget = alert.budget;
    return `O limite de <strong>${safeText(displayName(budget.category))}</strong> foi ultrapassado em ${money(alert.spent - budget.limit)}.`;
  }
  function renderAlerts() {
    const alerts = getAlertItems();
    $('#alertsPanel').hidden = alerts.length === 0;
    $('#alertTotal').textContent = String(alerts.length);
    $('#alertList').innerHTML = alerts.slice(0, 5).map(alert => {
      const label = alert.kind === 'overdue' ? 'Em atraso' : alert.kind === 'due' ? 'Próximo' : 'Orçamento';
      return `<div class="alert-row ${alert.kind}"><span class="alert-tag">${label}</span><span>${alertText(alert)}</span>${alert.item ? `<button class="alert-action" data-action="mark-paid" data-id="${safeText(alert.item.id)}" type="button">Marcar paga</button>` : ''}</div>`;
    }).join('');
    sendBrowserNotification(alerts);
  }
  function sendBrowserNotification(alerts) {
    if (!state.settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted' || !alerts.length) return;
    const today = dateString();
    if (state.settings.lastNotificationDay === today) return;
    const dueCount = alerts.filter(alert => alert.kind === 'due' || alert.kind === 'overdue').length;
    const budgetCount = alerts.filter(alert => alert.kind === 'overbudget').length;
    const parts = [];
    if (dueCount) parts.push(`${dueCount} conta${dueCount === 1 ? '' : 's'} precisa${dueCount === 1 ? '' : 'm'} de atenção`);
    if (budgetCount) parts.push(`${budgetCount} orçamento${budgetCount === 1 ? '' : 's'} ultrapassado${budgetCount === 1 ? '' : 's'}`);
    try {
      new Notification('Um lembrete do Meu Saldo', { body: parts.join(' · '), icon: '/public/favicon.svg', tag: `meu-saldo-${today}` });
      state.settings.lastNotificationDay = today;
      saveState();
    } catch (error) { console.info('O navegador não exibiu a notificação.', error); }
  }
  function updateReminderButton() {
    const button = $('#reminderButton');
    const isActive = state.settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted';
    button.title = isActive ? 'Lembretes do navegador ativados' : 'Ativar lembretes de vencimentos e orçamentos';
    const label = $('.reminder-label', button);
    if (label) label.textContent = isActive ? 'Ativos' : 'Lembretes';
    button.classList.toggle('reminder-active', isActive);
  }
  async function enableReminders() {
    if (!('Notification' in window)) {
      showToast('Este navegador não oferece notificações. Os alertas continuam visíveis no painel.');
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('As notificações estão bloqueadas nas permissões do navegador.');
      return;
    }
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission === 'granted') {
        state.settings.notificationsEnabled = true;
        saveState();
        updateReminderButton();
        const alerts = getAlertItems();
        if (alerts.length) sendBrowserNotification(alerts);
        showToast('Lembretes ativados enquanto o Meu Saldo estiver aberto.');
      } else showToast('Sem permissão para notificações. Seus alertas seguem no painel.');
    } catch (error) {
      showToast('Não foi possível ativar as notificações neste momento.');
    }
  }

  function renderSummary() {
    const incomes = selectedTransactions('income');
    const expenses = selectedTransactions('expense');
    const incomeTotal = sum(incomes);
    const expenseTotal = sum(expenses);
    const cardExpenses = expenses.filter(item => item.payment === 'Cartão de crédito');
    const invoiceTotal = sum(cardExpenses);
    const pendingInvoice = cardExpenses.filter(item => item.status !== 'paid');
    const balanceBeforeInvoice = incomeTotal - sum(expenses.filter(item => item.payment !== 'Cartão de crédito'));
    const balanceAfterInvoice = balanceBeforeInvoice - invoiceTotal;
    const pending = expenses.filter(item => item.status !== 'paid');
    $('#balanceValue').textContent = money(incomeTotal - expenseTotal);
    $('#balanceValue').classList.toggle('negative-value', incomeTotal < expenseTotal);
    $('#incomeValue').textContent = money(incomeTotal);
    $('#expenseValue').textContent = money(expenseTotal);
    $('#pendingValue').textContent = money(sum(pending));
    $('#incomeCount').textContent = `${incomes.length} ${incomes.length === 1 ? 'registro' : 'registros'}`;
    $('#expenseCount').textContent = `${expenses.length} ${expenses.length === 1 ? 'registro' : 'registros'}`;
    $('#pendingCount').textContent = `${pending.length} ${pending.length === 1 ? 'conta pendente' : 'contas pendentes'}`;
    $('#invoicePeriod').textContent = monthTitle(selectedMonth);
    $('#invoiceBefore').textContent = money(balanceBeforeInvoice);
    $('#invoiceTotal').textContent = money(invoiceTotal);
    $('#invoiceAfter').textContent = money(balanceAfterInvoice);
    $('#invoiceAfter').classList.toggle('negative-value', balanceAfterInvoice < 0);
    $('#invoiceCount').textContent = `${cardExpenses.length} ${cardExpenses.length === 1 ? 'lançamento' : 'lançamentos'} · ${money(sum(pendingInvoice))} em aberto`;
    $('#invoiceNote').textContent = cardExpenses.length
      ? `Inclui compras no crédito e parcelas com data em ${monthTitle(selectedMonth)}. Projeção baseada nas receitas e despesas que você registrou.`
      : `Sem despesas no crédito registradas para ${monthTitle(selectedMonth)}. Ao cadastrar parcelas, escolha o primeiro vencimento da fatura.`;
    $('#categoryPeriod').textContent = monthTitle(selectedMonth);
    $('#todayLabel').textContent = `SEU RESUMO · ${monthTitle(selectedMonth).toLocaleUpperCase('pt-BR')}`;
  }
  function renderCategoryChart() {
    const expenses = selectedTransactions('expense');
    const byCategory = new Map();
    expenses.forEach(item => byCategory.set(item.category, (byCategory.get(item.category) || 0) + Number(item.amount)));
    const all = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const total = sum(expenses);
    const top = all.slice(0, 5).map(([id, value], index) => ({ id, label: displayName(id), value, color: chartColors[index] }));
    const rest = all.slice(5).reduce((amount, [, value]) => amount + value, 0);
    if (rest > 0) top.push({ id: 'demais', label: 'Demais', value: rest, color: chartColors[5] });
    $('#donutTotal').textContent = money(total, true);
    $('#categoryEmpty').hidden = total > 0;
    $('#categoryDonut').hidden = total <= 0;
    $('#categoryLegend').innerHTML = top.map(item => `<div class="legend-row"><i class="legend-swatch" style="background:${item.color}"></i><span>${safeText(item.label)}</span><strong>${Math.round((item.value / total) * 100)}%</strong></div>`).join('');
    const segments = [];
    let current = 0;
    top.forEach(item => {
      const end = current + (item.value / total) * 360;
      segments.push(`${item.color} ${current.toFixed(2)}deg ${end.toFixed(2)}deg`);
      current = end;
    });
    $('#categoryDonut').style.background = total > 0 ? `conic-gradient(${segments.join(', ')})` : '';
    $('#categoryDonut').setAttribute('aria-label', total ? `Despesas por categoria, total de ${money(total)}` : 'Sem despesas registradas neste período');
  }
  function shiftMonth(month, offset) {
    const [year, number] = month.split('-').map(Number);
    return localMonth(new Date(year, number - 1 + offset, 1, 12));
  }
  function renderTrendChart() {
    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(selectedMonth, index - 5));
    const rows = months.map(month => {
      const items = state.transactions.filter(item => monthOf(item.date) === month);
      return { month, income: sum(items.filter(item => item.type === 'income')), expense: sum(items.filter(item => item.type === 'expense')) };
    });
    const maximum = Math.max(1, ...rows.flatMap(item => [item.income, item.expense]));
    $('#trendChart').innerHTML = rows.map(item => {
      const incomeHeight = Math.max(3, Math.round((item.income / maximum) * 88));
      const expenseHeight = Math.max(3, Math.round((item.expense / maximum) * 88));
      const [year, month] = item.month.split('-').map(Number);
      const label = monthNames[month - 1];
      return `<div class="trend-month"><div class="trend-bar income-bar" style="height:${incomeHeight}%"><span class="trend-tooltip">${safeText(money(item.income))}</span></div><div class="trend-bar expense-bar" style="height:${expenseHeight}%"><span class="trend-tooltip">${safeText(money(item.expense))}</span></div><span class="trend-month-label" title="${year}">${label}</span></div>`;
    }).join('');
  }
  function transactionSubtitle(item) {
    const category = displayName(item.category);
    if (item.installmentId) return `${category} · Parcela ${item.installmentIndex || ''}`;
    return item.type === 'expense' && item.payment ? `${category} · ${item.payment}` : category;
  }
  function renderRecent() {
    const recent = [...selectedTransactions()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $('#recentTransactions').innerHTML = recent.length ? `<div class="recent-list">${recent.map(item => {
      const cat = categoryInfo(item.category, item.type);
      const sign = item.type === 'income' ? '+' : '−';
      return `<div class="recent-row"><span class="category-icon ${item.type === 'expense' ? 'expense-icon-bg' : ''}">${safeText(cat.icon)}</span><span class="recent-info"><strong>${safeText(item.description)}</strong><small>${safeText(transactionSubtitle(item))} · ${safeText(formatDate(item.date))}</small></span><span class="recent-amount ${item.type}">${sign} ${safeText(money(item.amount))}</span></div>`;
    }).join('')}</div>` : '<div class="mini-empty">Suas movimentações vão aparecer aqui.</div>';
  }
  function renderBudgetPreview() {
    const budgets = state.budgets.filter(item => item.month === selectedMonth).slice(0, 4);
    $('#budgetPreview').innerHTML = budgets.length ? `<div class="budget-preview-list">${budgets.map(budget => {
      const spent = sum(expensesInMonth(selectedMonth, budget.category));
      const ratio = Number(budget.limit) > 0 ? (spent / budget.limit) * 100 : 0;
      const cls = ratio >= 100 ? 'exceeded' : ratio >= 80 ? 'warning' : '';
      return `<div><div class="budget-preview-head"><strong>${safeText(displayName(budget.category))}</strong><span>${safeText(money(spent))} / ${safeText(money(budget.limit))}</span></div><div class="progress-track"><div class="progress-fill ${cls}" style="width:${Math.min(100, ratio)}%"></div></div><div class="budget-preview-foot"><span>${Math.round(ratio)}% usado</span><span>${ratio >= 100 ? `Acima em ${safeText(money(spent - budget.limit))}` : `Restam ${safeText(money(budget.limit - spent))}`}</span></div></div>`;
    }).join('')}</div>` : '<div class="mini-empty">Defina um limite por categoria para acompanhar seu plano.</div>';
  }

  function updateCategoryFilter() {
    const select = $('#categoryFilter');
    const previous = select.value;
    const ids = [...new Set([...categories.income, ...categories.expense].map(item => item.id))];
    select.innerHTML = '<option value="all">Todas as categorias</option>' + ids.map(id => `<option value="${safeText(id)}">${safeText(displayName(id))}</option>`).join('');
    if (ids.includes(previous)) select.value = previous;
  }
  function isOverdue(item) { return item.status !== 'paid' && item.type === 'expense' && item.date < dateString(); }
  function transactionRow(item) {
    const cat = categoryInfo(item.category, item.type);
    const statusText = item.status === 'paid' ? (item.type === 'income' ? 'Recebida' : 'Paga') : isOverdue(item) ? 'Em atraso' : item.type === 'income' ? 'A receber' : 'Pendente';
    const statusClass = item.status === 'paid' ? '' : isOverdue(item) ? ' overdue' : ' pending';
    const sign = item.type === 'income' ? '+' : '−';
    return `<tr><td><div class="transaction-name"><span class="category-icon ${item.type === 'expense' ? 'expense-icon-bg' : ''}">${safeText(cat.icon)}</span><span><strong>${safeText(item.description)}</strong><small>${item.type === 'income' ? 'Receita' : 'Despesa'}${item.installmentId ? ' · Parcelada' : ''}</small></span></div></td><td>${safeText(displayName(item.category))}</td><td>${safeText(formatDate(item.date))}</td><td><span class="status-badge${statusClass}">${statusText}</span></td><td class="amount-cell ${item.type === 'income' ? 'income' : ''}">${sign} ${safeText(money(item.amount))}</td><td><div class="row-actions"><button class="row-action" data-action="toggle-status" data-id="${safeText(item.id)}" type="button" aria-label="${item.status === 'paid' ? 'Marcar como pendente' : 'Marcar como paga'}" title="${item.status === 'paid' ? 'Marcar como pendente' : 'Marcar como paga'}">${item.status === 'paid' ? '◷' : '✓'}</button><button class="row-action" data-action="edit-transaction" data-id="${safeText(item.id)}" type="button" aria-label="Editar ${safeText(item.description)}" title="Editar">✎</button><button class="row-action delete" data-action="delete-transaction" data-id="${safeText(item.id)}" type="button" aria-label="Excluir ${safeText(item.description)}" title="Excluir">×</button></div></td></tr>`;
  }
  function renderTransactions() {
    updateCategoryFilter();
    const query = $('#searchInput').value.trim().toLocaleLowerCase('pt-BR');
    const type = $('#typeFilter').value;
    const category = $('#categoryFilter').value;
    const monthly = selectedTransactions().filter(item => (type === 'all' || item.type === type) && (category === 'all' || item.category === category) && (!query || item.description.toLocaleLowerCase('pt-BR').includes(query)));
    monthly.sort((a, b) => b.date.localeCompare(a.date));
    const isEmptyMonth = selectedTransactions().length === 0;
    $('#transactionsTable').innerHTML = monthly.map(transactionRow).join('');
    $('#transactionEmpty').hidden = !isEmptyMonth;
    $('#filterEmpty').hidden = isEmptyMonth || monthly.length > 0;
    $('.table-wrap', $('#transactionsView')).hidden = isEmptyMonth || monthly.length === 0;
  }

  function planTransactions(plan) {
    return state.transactions.filter(item => item.installmentId === plan.id).sort((a, b) => (a.installmentIndex || 0) - (b.installmentIndex || 0));
  }
  function installmentProgress(plan) {
    const items = planTransactions(plan);
    const paid = items.filter(item => item.status === 'paid').length;
    const total = sum(items);
    const next = items.find(item => item.status !== 'paid') || null;
    return { items, paid, total, next, count: items.length };
  }
  function shiftMonthKey(month, offset) {
    const [year, number] = month.split('-').map(Number);
    return localMonth(new Date(year, number - 1 + offset, 1, 12));
  }
  function compactMonth(month) {
    const [year, number] = month.split('-').map(Number);
    return `${monthNames[number - 1]}/${String(year).slice(-2)}`;
  }
  function renderInstallmentSheet(plans) {
    const months = Array.from({ length: 12 }, (_, index) => shiftMonthKey(selectedMonth, installmentWindowOffset + index));
    const currentMonth = localMonth();
    const monthHeading = month => {
      const [year, number] = month.split('-').map(Number);
      const currentClass = month === currentMonth ? ' sheet-current-month' : '';
      return `<th class="sheet-month-column${currentClass}" scope="col"><span>${monthNames[number - 1]}</span><small>${year}</small></th>`;
    };
    const monthlyTotal = new Map(months.map(month => [month, 0]));
    const monthlyOpen = new Map(months.map(month => [month, 0]));
    $('#installmentGridRange').textContent = `${compactMonth(months[0])} — ${compactMonth(months[months.length - 1])}`;
    $('#installmentGridReset').hidden = installmentWindowOffset === 0;
    $('#installmentSheetHead').innerHTML = `<tr><th class="sheet-first-col" scope="col">Compra · andamento</th>${months.map(monthHeading).join('')}</tr>`;
    $('#installmentSheetBody').innerHTML = plans.map(plan => {
      const progress = installmentProgress(plan);
      const itemsByMonth = new Map(months.map(month => [month, []]));
      progress.items.forEach((item, index) => {
        const month = monthOf(item.date);
        if (!itemsByMonth.has(month)) return;
        itemsByMonth.get(month).push({ item, index });
        monthlyTotal.set(month, monthlyTotal.get(month) + Number(item.amount || 0));
        if (item.status !== 'paid') monthlyOpen.set(month, monthlyOpen.get(month) + Number(item.amount || 0));
      });
      const firstMonth = monthOf(progress.items[0]?.date || plan.firstDate || selectedMonth);
      const category = displayName(plan.category);
      const cells = months.map(month => {
        const entries = itemsByMonth.get(month);
        if (!entries.length) return `<td class="sheet-cell sheet-cell-empty" aria-label="Sem parcela em ${safeText(compactMonth(month))}">—</td>`;
        return `<td class="sheet-cell">${entries.map(({ item, index }) => {
          const status = item.status === 'paid' ? 'paid' : isOverdue(item) ? 'overdue' : 'pending';
          const statusLabel = status === 'paid' ? 'Paga' : status === 'overdue' ? 'Atrasada' : 'Em aberto';
          const installmentNumber = item.installmentIndex || index + 1;
          return `<div class="sheet-entry ${status}"><strong>${safeText(money(item.amount))}</strong><span>${installmentNumber}/${plan.count} · ${statusLabel}</span></div>`;
        }).join('')}</td>`;
      }).join('');
      return `<tr><th class="sheet-first-col sheet-purchase" scope="row"><strong>${safeText(plan.description)}</strong><span>${safeText(category)} · ${progress.count} parcelas · início ${safeText(compactMonth(firstMonth))}</span><small>${safeText(money(progress.total))} · ${progress.paid} de ${progress.count} pagas</small></th>${cells}</tr>`;
    }).join('');
    $('#installmentSheetFoot').innerHTML = `<tr><th class="sheet-first-col" scope="row">Total previsto por mês</th>${months.map(month => {
      const total = monthlyTotal.get(month) || 0;
      const open = monthlyOpen.get(month) || 0;
      const currentClass = month === currentMonth ? ' sheet-current-month' : '';
      return `<td class="sheet-total-cell${currentClass}">${total ? `<strong>${safeText(money(total))}</strong><small>${safeText(money(open))} em aberto</small>` : '<span>—</span>'}</td>`;
    }).join('')}</tr>`;
  }
  function renderInstallments() {
    const plans = [...state.installments].sort((a, b) => String(a.firstDate).localeCompare(String(b.firstDate)));
    const allItems = plans.flatMap(plan => planTransactions(plan));
    const openItems = allItems.filter(item => item.status !== 'paid');
    $('#installmentNavCount').textContent = String(openItems.length);
    $('#installmentSummary').innerHTML = `<div class="installment-summary-card"><span>Compras parceladas</span><strong>${plans.length}</strong></div><div class="installment-summary-card"><span>Parcelas em aberto</span><strong>${openItems.length}</strong></div><div class="installment-summary-card"><span>Valor pendente</span><strong>${safeText(money(sum(openItems)))}</strong></div>`;
    $('#installmentEmpty').hidden = plans.length > 0;
    $('#installmentSummary').hidden = plans.length === 0;
    $('#installmentSheetSection').hidden = plans.length === 0;
    $('#installmentDetailsHeading').hidden = plans.length === 0;
    if (plans.length) renderInstallmentSheet(plans);
    $('#installmentList').innerHTML = plans.map(plan => {
      const progress = installmentProgress(plan);
      const percent = progress.count ? progress.paid / progress.count * 100 : 0;
      const next = progress.next;
      return `<article class="installment-card"><div class="installment-card-head"><span class="category-icon expense-icon-bg">${safeText(categoryInfo(plan.category).icon)}</span><div class="installment-title"><h2>${safeText(plan.description)}</h2><p>${safeText(displayName(plan.category))} · ${safeText(plan.payment || 'Parcelado')}</p></div><div class="installment-total">${safeText(money(progress.total))}<small>${progress.count} parcelas de ${safeText(money(progress.count ? progress.total / progress.count : 0))}</small></div></div><div class="installment-progress-row"><span><strong>${progress.paid} de ${progress.count}</strong> parcelas pagas</span><span>${Math.round(percent)}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><div class="installment-upcoming">${next ? `Próximo vencimento: <strong>${safeText(formatDate(next.date))}</strong> · ${safeText(money(next.amount))}${isOverdue(next) ? ' · <span class="overdue-text">em atraso</span>' : ''}` : '<strong>Compra quitada</strong> · Todas as parcelas foram pagas.'}</div><div class="installment-actions">${next ? `<button class="button button-soft" data-action="pay-installment" data-id="${safeText(next.id)}" type="button">${isOverdue(next) ? 'Registrar pagamento' : 'Marcar próxima como paga'}</button>` : ''}<button class="button button-ghost" data-action="view-installment" data-id="${safeText(plan.id)}" type="button">Ver parcelas</button><button class="button button-ghost" data-action="delete-installment" data-id="${safeText(plan.id)}" type="button">Excluir</button></div></article>`;
    }).join('');
  }

  function openBudgetForm(budget = null) {
    $('#budgetForm').reset();
    $('#budgetId').value = budget?.id || '';
    $('#budgetError').hidden = true;
    $('#budgetDialogTitle').textContent = budget ? 'Editar limite' : 'Definir limite';
    $('#budgetMonthLabel').textContent = `Orçamento para ${monthTitle(selectedMonth)}`;
    fillSelect($('#budgetCategory'), categories.expense, budget?.category || null);
    $('#budgetLimit').value = budget ? Number(budget.limit).toFixed(2) : '';
    openDialog('budgetDialog');
  }
  function saveBudget(event) {
    event.preventDefault();
    const id = $('#budgetId').value;
    const category = $('#budgetCategory').value;
    const limit = Math.round(Number($('#budgetLimit').value) * 100) / 100;
    const error = $('#budgetError');
    if (!category || !Number.isFinite(limit) || limit <= 0) {
      error.textContent = 'Escolha uma categoria e informe um limite maior que zero.';
      error.hidden = false;
      return;
    }
    const duplicate = state.budgets.find(item => item.month === selectedMonth && item.category === category && item.id !== id);
    if (duplicate) {
      error.textContent = 'Já existe um orçamento para essa categoria neste mês. Edite o limite existente.';
      error.hidden = false;
      return;
    }
    if (id) state.budgets = state.budgets.map(item => item.id === id ? { ...item, category, limit, month: selectedMonth } : item);
    else state.budgets.push({ id: newId(), category, limit, month: selectedMonth });
    saveState();
    closeDialog('budgetDialog');
    render();
    showToast(id ? 'Orçamento atualizado.' : 'Orçamento definido para este mês.');
  }
  function renderBudgets() {
    const budgets = state.budgets.filter(item => item.month === selectedMonth);
    const totalLimit = sum(budgets.map(item => ({ amount: item.limit })));
    const totalSpent = sum(state.transactions.filter(item => item.type === 'expense' && monthOf(item.date) === selectedMonth));
    const remaining = totalLimit - sum(budgets.map(budget => Math.min(Number(budget.limit), sum(expensesInMonth(selectedMonth, budget.category)))));
    $('#budgetOverview').innerHTML = `<div><div class="budget-overview-label">Limite definido em ${safeText(monthTitle(selectedMonth))}</div><div class="budget-overview-total">${safeText(money(totalLimit))} <small>no total</small></div></div><div class="budget-overview-side">${safeText(money(totalSpent))} gastos no mês<strong>${totalLimit ? `Restam ${safeText(money(remaining))}` : 'Defina seu primeiro limite'}</strong></div>`;
    $('#budgetEmpty').hidden = budgets.length > 0;
    $('#budgetGrid').hidden = budgets.length === 0;
    $('#budgetGrid').innerHTML = budgets.map(budget => {
      const spent = sum(expensesInMonth(selectedMonth, budget.category));
      const ratio = budget.limit ? (spent / budget.limit) * 100 : 0;
      const cls = ratio >= 100 ? 'exceeded' : ratio >= 80 ? 'warning' : '';
      const cat = categoryInfo(budget.category);
      const status = ratio > 100 ? 'Limite ultrapassado' : ratio === 100 ? 'Limite atingido' : ratio >= 80 ? 'Quase no limite' : 'Dentro do planejado';
      return `<article class="budget-card"><div class="budget-card-top"><span class="category-icon expense-icon-bg">${safeText(cat.icon)}</span><strong class="budget-category">${safeText(displayName(budget.category))}</strong><span class="budget-card-actions"><button class="row-action" data-action="edit-budget" data-id="${safeText(budget.id)}" type="button" aria-label="Editar orçamento de ${safeText(displayName(budget.category))}">✎</button><button class="row-action delete" data-action="delete-budget" data-id="${safeText(budget.id)}" type="button" aria-label="Excluir orçamento de ${safeText(displayName(budget.category))}">×</button></span></div><div class="budget-card-values">${safeText(money(spent))}<span>de ${safeText(money(budget.limit))}</span></div><div class="progress-track"><div class="progress-fill ${cls}" style="width:${Math.min(100, ratio)}%"></div></div><div class="budget-card-status"><span>${Math.round(ratio)}% utilizado</span><strong class="${cls}">${status}</strong></div></article>`;
    }).join('');
  }
  function updateMonth() {
    selectedMonth = $('#monthPicker').value || localMonth();
    installmentWindowOffset = 0;
    render();
    if (activeView === 'budgets') $('#budgetMonthLabel').textContent = `Orçamento para ${monthTitle(selectedMonth)}`;
  }
  function render() {
    renderSummary();
    renderAlerts();
    renderCategoryChart();
    renderTrendChart();
    renderRecent();
    renderBudgetPreview();
    renderTransactions();
    renderInstallments();
    renderBudgets();
    updateReminderButton();
  }
  function exportData() {
    const payload = { app: 'Meu Saldo', exportedAt: new Date().toISOString(), version: 1, data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `meu-saldo-${dateString()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Cópia dos seus dados baixada em JSON.');
  }
  async function clearData() {
    if (!state.transactions.length && !state.installments.length && !state.budgets.length) {
      showToast('Ainda não há dados salvos para apagar.');
      return;
    }
    const confirmed = await askForConfirmation({
      title: 'Apagar todos os dados?',
      message: 'Todas as receitas, despesas, parcelas, orçamentos e preferências deste navegador serão removidos. Essa ação não pode ser desfeita. Considere exportar uma cópia antes.',
      confirmLabel: 'Apagar dados'
    });
    if (!confirmed) return;
    state = makeEmptyState();
    try {
      if (auth.currentUser) await remove(ref(db, `users/${auth.currentUser.uid}/state`));
      render();
      showToast('Todos os seus dados foram removidos da nuvem.');
    } catch (error) {
      console.error('Não foi possível apagar os dados do Firebase.', error);
      showToast('Não foi possível apagar os dados.');
    }
  }
  function toggleTransactionStatus(id) {
    const target = state.transactions.find(item => item.id === id);
    if (!target) return;
    target.status = target.status === 'paid' ? 'pending' : 'paid';
    saveState();
    render();
    showToast(target.status === 'paid' ? 'Movimentação marcada como paga.' : 'Movimentação marcada como pendente.');
  }
  async function deleteTransaction(id) {
    const item = state.transactions.find(transaction => transaction.id === id);
    if (!item) return;
    if (item.installmentId) {
      const confirmed = await askForConfirmation({
        title: 'Excluir a compra parcelada?',
        message: 'Este item faz parte de uma compra parcelada. A exclusão removerá o parcelamento inteiro e todas as parcelas associadas.',
        confirmLabel: 'Excluir parcelamento'
      });
      if (!confirmed) return;
      state.transactions = state.transactions.filter(transaction => transaction.installmentId !== item.installmentId);
      state.installments = state.installments.filter(plan => plan.id !== item.installmentId);
    } else {
      const confirmed = await askForConfirmation({
        title: 'Excluir movimentação?',
        message: `A movimentação “${item.description}” será removida permanentemente.`,
        confirmLabel: 'Excluir movimentação'
      });
      if (!confirmed) return;
      state.transactions = state.transactions.filter(transaction => transaction.id !== id);
    }
    saveState();
    render();
    showToast('Movimentação excluída.');
  }
  async function deletePlan(id) {
    const plan = state.installments.find(item => item.id === id);
    if (!plan || !await askForConfirmation({
      title: 'Excluir parcelamento?',
      message: `O parcelamento “${plan.description}” e todas as parcelas associadas serão removidos permanentemente.`,
      confirmLabel: 'Excluir parcelamento'
    })) return;
    state.transactions = state.transactions.filter(item => item.installmentId !== id);
    state.installments = state.installments.filter(item => item.id !== id);
    saveState();
    render();
    showToast('Parcelamento excluído.');
  }
  async function deleteBudget(id) {
    const budget = state.budgets.find(item => item.id === id);
    if (!budget || !await askForConfirmation({
      title: 'Excluir orçamento?',
      message: `O orçamento de ${displayName(budget.category)} para ${monthTitle(budget.month)} será removido permanentemente.`,
      confirmLabel: 'Excluir orçamento'
    })) return;
    state.budgets = state.budgets.filter(item => item.id !== id);
    saveState();
    render();
    showToast('Orçamento removido.');
  }
  function handleAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'toggle-status' || action === 'mark-paid' || action === 'pay-installment') toggleTransactionStatus(id);
    if (action === 'edit-transaction') {
      const item = state.transactions.find(transaction => transaction.id === id);
      if (item) openTransactionForm(item.type, item);
    }
    if (action === 'delete-transaction') deleteTransaction(id);
    if (action === 'delete-installment') deletePlan(id);
    if (action === 'view-installment') {
      const plan = state.installments.find(item => item.id === id);
      if (plan) {
        $('#searchInput').value = plan.description;
        $('#typeFilter').value = 'all';
        $('#categoryFilter').value = 'all';
        setPage('transactions');
        renderTransactions();
      }
    }
    if (action === 'edit-budget') {
      const budget = state.budgets.find(item => item.id === id);
      if (budget) openBudgetForm(budget);
    }
    if (action === 'delete-budget') deleteBudget(id);
  }

  function clearDemoCredentials() {
    ['demoFullName', 'demoEmail', 'demoPassword', 'demoCpf', 'demoLoginEmail', 'demoLoginPassword']
      .forEach(id => { const input = document.getElementById(id); if (input) input.value = ''; });
  }

  function setDemoAuthMode(mode) {
    const registering = mode !== 'login';
    clearDemoCredentials();
    $('#registerFields').hidden = !registering;
    $('#loginFields').hidden = registering;
    $('#registerMode').classList.toggle('active', registering);
    $('#loginMode').classList.toggle('active', !registering);
    $('#registerMode').setAttribute('aria-selected', String(registering));
    $('#loginMode').setAttribute('aria-selected', String(!registering));
    $('#authTitle').textContent = registering ? 'Crie sua conta' : 'Entre na sua conta';
    $('#authSubtitle').textContent = registering
      ? 'Sua conta será usada para salvar e recuperar seus dados.'
      : 'Entre com o e-mail e a senha cadastrados.';
    $('#demoOpenApp').innerHTML = registering
      ? 'Criar conta e abrir painel <span aria-hidden="true">→</span>'
      : 'Entrar no painel <span aria-hidden="true">→</span>';
  }

  function firebaseErrorMessage(error) {
    const messages = {
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/invalid-email': 'Digite um e-mail válido.',
      'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    };
    return messages[error?.code] || 'Não foi possível concluir a operação. Tente novamente.';
  }

  async function openDemoApp() {
    const registerMode = !$('#registerFields').hidden;
    const button = $('#demoOpenApp');
    button.disabled = true;

    try {
      if (registerMode) {
        const name = $('#demoFullName').value.trim();
        const email = $('#demoEmail').value.trim();
        const password = $('#demoPassword').value;
        const cpf = $('#demoCpf').value.trim();

        if (!name || !email || !password) {
          showToast('Preencha nome, e-mail e senha.');
          return;
        }
        if (password.length < 6) {
          showToast('A senha precisa ter pelo menos 6 caracteres.');
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name });

        await set(ref(db, `users/${credential.user.uid}/profile`), {
          name,
          email,
          cpf: cpf || '',
          createdAt: new Date().toISOString()
        });

        state = makeEmptyState();
        await saveState();
      } else {
        const email = $('#demoLoginEmail').value.trim();
        const password = $('#demoLoginPassword').value;

        if (!email || !password) {
          showToast('Preencha e-mail e senha.');
          return;
        }

        await signInWithEmailAndPassword(auth, email, password);
      }

      clearDemoCredentials();
      $('#authScreen').hidden = true;
      $('#appShell').hidden = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) {
      console.error(error);
      showToast(firebaseErrorMessage(error));
    } finally {
      button.disabled = false;
    }
  }

  async function returnToDemoAuth() {
    await signOut(auth);
    clearDemoCredentials();
    $('#appShell').hidden = true;
    $('#authScreen').hidden = false;
    setDemoAuthMode('register');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function bindEvents() {
    $('#registerMode').addEventListener('click', () => setDemoAuthMode('register'));
    $('#loginMode').addEventListener('click', () => setDemoAuthMode('login'));
    $('#demoOpenApp').addEventListener('click', openDemoApp);
    $('#demoBackButton').addEventListener('click', returnToDemoAuth);
    setDemoAuthMode('register');
    $('#monthPicker').value = selectedMonth;
    $('#monthPicker').addEventListener('change', updateMonth);
    $$('.nav-link[data-view]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.view)));
    $$('[data-goto]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.goto)));
    $('#addExpenseButton').addEventListener('click', () => openTransactionForm('expense'));
    $('#addIncomeButton').addEventListener('click', () => openTransactionForm('income'));
    $('#viewAddIncome').addEventListener('click', () => openTransactionForm('income'));
    $('#viewAddExpense').addEventListener('click', () => openTransactionForm('expense'));
    $('#emptyAddButton').addEventListener('click', () => openTransactionForm('expense'));
    $('#transactionForm').addEventListener('submit', saveTransaction);
    $$('[data-transaction-type]').forEach(button => button.addEventListener('click', () => setTransactionType(button.dataset.transactionType)));
    $('#transactionPayment').addEventListener('change', handleTransactionPaymentChange);
    $('#openInstallmentFromExpense').addEventListener('click', openInstallmentFromExpense);
    $('#addInstallmentButton').addEventListener('click', openInstallmentForm);
    $('#emptyInstallmentButton').addEventListener('click', openInstallmentForm);
    $('#installmentGridPrev').addEventListener('click', () => { installmentWindowOffset -= 6; renderInstallments(); });
    $('#installmentGridNext').addEventListener('click', () => { installmentWindowOffset += 6; renderInstallments(); });
    $('#installmentGridReset').addEventListener('click', () => { installmentWindowOffset = 0; renderInstallments(); });
    $('#installmentForm').addEventListener('submit', saveInstallment);
    ['installmentAmount', 'installmentCount', 'installmentPaid'].forEach(id => document.getElementById(id).addEventListener('input', updateInstallmentPreview));
    $('#addBudgetButton').addEventListener('click', () => openBudgetForm());
    $('#emptyBudgetButton').addEventListener('click', () => openBudgetForm());
    $('#budgetForm').addEventListener('submit', saveBudget);
    ['searchInput', 'typeFilter', 'categoryFilter'].forEach(id => document.getElementById(id).addEventListener('input', renderTransactions));
    $('#transactionsTable').addEventListener('click', handleAction);
    $('#alertList').addEventListener('click', handleAction);
    $('#installmentList').addEventListener('click', handleAction);
    $('#budgetGrid').addEventListener('click', handleAction);
    $('#exportButton').addEventListener('click', exportData);
    $('#privacyExport').addEventListener('click', exportData);
    $('#clearButton').addEventListener('click', clearData);
    $('#privacyClear').addEventListener('click', clearData);
    $('#confirmationCancel').addEventListener('click', () => finishConfirmation(false));
    $('#confirmationAccept').addEventListener('click', () => finishConfirmation(true));
    $('#confirmationDialog').addEventListener('cancel', event => {
      event.preventDefault();
      finishConfirmation(false);
    });
    $('#reminderButton').addEventListener('click', enableReminders);
    $('#menuToggle').addEventListener('click', () => {
      const sidebar = $('#sidebar');
      const expanded = sidebar.classList.toggle('open');
      $('#menuToggle').setAttribute('aria-expanded', String(expanded));
    });
    document.addEventListener('click', event => {
      const closer = event.target.closest('[data-close]');
      if (closer) closeDialog(closer.dataset.close);
    });
    document.querySelectorAll('dialog.modal').forEach(dialog => dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      if (dialog.id === 'confirmationDialog') finishConfirmation(false);
      else dialog.close();
    }));
    // O Firebase substitui a persistência local do navegador.
    window.setInterval(() => { if (!document.hidden) renderAlerts(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAlerts(); });
  }

  bindEvents();
  updateCategoryFilter();

  onAuthStateChanged(auth, async user => {
    if (!user) {
      state = makeEmptyState();
      $('#authScreen').hidden = false;
      $('#appShell').hidden = true;
      return;
    }

    try {
      state = await loadState();
      $('#authScreen').hidden = true;
      $('#appShell').hidden = false;

      const profileName = user.displayName || user.email?.split('@')[0] || 'Meu espaço';
      const profileStrong = $('.profile strong');
      const profileSmall = $('.profile small');
      const avatar = $('.avatar');
      if (profileStrong) profileStrong.textContent = profileName;
      if (profileSmall) profileSmall.textContent = user.email || 'Conta Firebase';
      if (avatar) avatar.textContent = profileName.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();

      render();
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar sua conta.');
    }
  });
})();
