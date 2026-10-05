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

  const chartColors = [
    '#72a983',
    '#e6a77f',
    '#e5c565',
    '#86a8bd',
    '#b19bc6',
    '#8fc4b7',
    '#d98773',
    '#a5b375',
    '#84a5a0',
    '#c6a37a'
  ];

  const monthNames = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'
  ];

  const monthLong = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  });

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

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
    return {
      transactions: [],
      installments: [],
      budgets: [],
      settings: {
        notificationsEnabled: false,
        lastNotificationDay: ''
      }
    };
  }

  function normalizeState(saved) {
    if (!saved || typeof saved !== 'object') {
      return makeEmptyState();
    }

    return {
      transactions: Array.isArray(saved.transactions)
        ? saved.transactions
        : [],

      installments: Array.isArray(saved.installments)
        ? saved.installments
        : [],

      budgets: Array.isArray(saved.budgets)
        ? saved.budgets
        : [],

      settings: {
        ...makeEmptyState().settings,
        ...(saved.settings || {})
      }
    };
  }

  async function loadState() {
    const user = auth.currentUser;

    if (!user) {
      return makeEmptyState();
    }

    try {
      const snapshot = await get(
        ref(db, `users/${user.uid}/state`)
      );

      return normalizeState(
        snapshot.exists()
          ? snapshot.val()
          : null
      );

    } catch (error) {
      console.error(
        'Não foi possível carregar os dados do Firebase.',
        error
      );

      showToast(
        'Não foi possível carregar seus dados da nuvem.'
      );

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
      showToast('Faça login para salvar seus dados.');
      return false;
    }

    try {
      await set(
        ref(db, `users/${user.uid}/state`),
        state
      );

      return true;

    } catch (error) {
      console.error(
        'Não foi possível salvar os dados no Firebase.',
        error
      );

      showToast(
        'Não foi possível salvar seus dados na nuvem.'
      );

      return false;
    }
  }

  function money(value, compact = false) {
    const amount = Number(value) || 0;

    if (compact && Math.abs(amount) >= 100000) {
      return `R$ ${(amount / 1000).toLocaleString('pt-BR', {
        maximumFractionDigits: 0
      })} mil`;
    }

    return currencyFormatter.format(amount);
  }

  function safeText(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
    );
  }

  function parseLocalDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const [year, month, day] = value
      .split('-')
      .map(Number);

    return new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0,
      0
    );
  }

  function formatDate(value) {
    const parsed = parseLocalDate(value);

    return parsed
      ? dateFormatter.format(parsed).replace('.', '')
      : '—';
  }

  function monthTitle(month) {
    const [year, number] = month.split('-').map(Number);

    return monthLong.format(
      new Date(year, number - 1, 1, 12)
    );
  }

  function categoryInfo(id, type = 'expense') {
    return categories[type].find(
      category => category.id === id
    )
      || [
        ...categories.income,
        ...categories.expense
      ].find(
        category => category.id === id
      )
      || {
        id: 'outros',
        label: 'Outros',
        icon: '···'
      };
  }

  function monthOf(value) {
    return String(value || '').slice(0, 7);
  }

  function inSelectedMonth(transaction) {
    return monthOf(transaction.date) === selectedMonth;
  }

  function selectedTransactions(type = null) {
    return state.transactions.filter(
      item =>
        inSelectedMonth(item) &&
        (!type || item.type === type)
    );
  }

  function sum(list) {
    return list.reduce(
      (total, item) =>
        total + (Number(item.amount) || 0),
      0
    );
  }

  function expensesInMonth(month, category = null) {
    return state.transactions.filter(
      item =>
        item.type === 'expense' &&
        monthOf(item.date) === month &&
        (!category || item.category === category)
    );
  }

  function displayName(categoryId) {
    const info = [
      ...categories.income,
      ...categories.expense
    ].find(
      category => category.id === categoryId
    );

    return info ? info.label : 'Outros';
  }

  function showToast(message) {
    const toast = $('#toast');

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(
      () => toast.classList.remove('visible'),
      2800
    );
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);

    if (
      dialog &&
      typeof dialog.showModal === 'function'
    ) {
      dialog.showModal();
    }
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);

    if (dialog?.open) {
      dialog.close();
    }
  }

  function finishConfirmation(confirmed) {
    const resolve = confirmationResolve;

    confirmationResolve = null;

    closeDialog('confirmationDialog');

    if (resolve) {
      resolve(confirmed);
    }
  }

  function askForConfirmation({
    title,
    message,
    confirmLabel = 'Excluir'
  }) {
    const dialog = $('#confirmationDialog');

    if (
      !dialog ||
      typeof dialog.showModal !== 'function'
    ) {
      showToast(
        'Este navegador não permite abrir a confirmação de exclusão.'
      );

      return Promise.resolve(false);
    }

    if (confirmationResolve) {
      finishConfirmation(false);
    }

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

    select.innerHTML = list
      .map(
        item =>
          `<option value="${safeText(item.id)}">${safeText(item.label)}</option>`
      )
      .join('');

    if (
      list.some(item => item.id === previous)
    ) {
      select.value = previous;
    }
  }

  function updateTransactionDateLabel() {
    const label = $('#transactionDateLabel');

    if (!label) return;

    const isCreditCard =
      selectedTransactionType === 'expense' &&
      $('#transactionPayment').value === 'Cartão de crédito';

    label.textContent = isCreditCard
      ? 'Data que entra na fatura'
      : 'Data';
  }

  function handleTransactionPaymentChange() {
    updateTransactionDateLabel();

    if (
      !$('#transactionId').value &&
      $('#transactionPayment').value === 'Cartão de crédito'
    ) {
      $('#transactionStatus').value = 'pending';
    }
  }

  function setTransactionType(type) {
    selectedTransactionType = type;

    $$('[data-transaction-type]').forEach(
      button =>
        button.classList.toggle(
          'active',
          button.dataset.transactionType === type
        )
    );

    const income = type === 'income';

    $('#transactionDialogTitle').textContent =
      $('#transactionId').value
        ? 'Editar movimentação'
        : `Adicionar ${income ? 'receita' : 'despesa'}`;

    $('#paymentField').hidden = income;

    $('#statusLabel').textContent = 'Situação';

    const status = $('#transactionStatus');

    status.options[0].textContent =
      income ? 'Recebida' : 'Paga';

    status.options[1].textContent =
      income ? 'A receber' : 'Pendente';

    fillSelect(
      $('#transactionCategory'),
      categories[type]
    );

    updateTransactionDateLabel();
  }

  function updateCategoryFilter() {
    const type = $('#typeFilter')?.value;

    let list = [
      ...categories.income,
      ...categories.expense
    ];

    if (type === 'income') {
      list = categories.income;
    }

    if (type === 'expense') {
      list = categories.expense;
    }

    const unique = [
      ...new Map(
        list.map(item => [item.id, item])
      ).values()
    ];

    fillSelect(
      $('#categoryFilter'),
      [
        {
          id: 'all',
          label: 'Todas as categorias'
        },
        ...unique
      ]
    );
  }

  function updateMonth() {
    selectedMonth =
      $('#monthPicker').value || localMonth();

    render();
  }

  function setPage(view) {
    activeView = view;

    $$('.page').forEach(page => {
      page.hidden = page.dataset.view !== view;
    });

    $$('.nav-link[data-view]').forEach(link => {
      link.classList.toggle(
        'active',
        link.dataset.view === view
      );
    });

    if (view === 'dashboard') {
      renderDashboard();
    }

    if (view === 'transactions') {
      renderTransactions();
    }

    if (view === 'installments') {
      renderInstallments();
    }

    if (view === 'budgets') {
      renderBudgets();
    }

    if (view === 'settings') {
      renderSettings();
    }

    const sidebar = $('#sidebar');

    if (sidebar) {
      sidebar.classList.remove('open');
    }
  }

  function render() {
    $('#monthPicker').value = selectedMonth;

    renderDashboard();
    renderTransactions();
    renderInstallments();
    renderBudgets();
    renderSettings();
    renderAlerts();

    setPage(activeView);
  }

  function renderDashboard() {
    const transactions =
      selectedTransactions();

    const incomes =
      selectedTransactions('income');

    const expenses =
      selectedTransactions('expense');

    const totalIncome = sum(incomes);
    const totalExpense = sum(expenses);
    const balance =
      totalIncome - totalExpense;

    const incomeEl = $('#dashboardIncome');
    const expenseEl = $('#dashboardExpense');
    const balanceEl = $('#dashboardBalance');

    if (incomeEl) {
      incomeEl.textContent = money(totalIncome);
    }

    if (expenseEl) {
      expenseEl.textContent = money(totalExpense);
    }

    if (balanceEl) {
      balanceEl.textContent = money(balance);
    }

    const countEl =
      $('#dashboardTransactionCount');

    if (countEl) {
      countEl.textContent =
        `${transactions.length} movimentação${transactions.length === 1 ? '' : 's'}`;
    }

    renderChart(expenses);
  }

  function renderChart(expenses) {
    const container = $('#expenseChart');

    if (!container) return;

    const totals = {};

    expenses.forEach(item => {
      totals[item.category] =
        (totals[item.category] || 0) +
        Number(item.amount || 0);
    });

    const entries = Object.entries(totals)
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma despesa neste mês.</p>
        </div>
      `;

      return;
    }

    const total = entries.reduce(
      (acc, [, value]) => acc + value,
      0
    );

    container.innerHTML = entries
      .map(([category, value], index) => {
        const percent =
          total > 0
            ? (value / total) * 100
            : 0;

        return `
          <div class="chart-row">
            <div class="chart-label">
              <span>
                ${safeText(displayName(category))}
              </span>

              <strong>
                ${money(value)}
              </strong>
            </div>

            <div class="chart-bar">
              <span
                style="
                  width:${percent}%;
                  background:${chartColors[index % chartColors.length]}
                "
              ></span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderTransactions() {
    const table = $('#transactionsTable');

    if (!table) return;

    const search =
      $('#searchInput')?.value
        .trim()
        .toLowerCase() || '';

    const type =
      $('#typeFilter')?.value || 'all';

    const category =
      $('#categoryFilter')?.value || 'all';

    const list =
      selectedTransactions()
        .filter(item => {
          const matchesSearch =
            !search ||
            String(item.description || '')
              .toLowerCase()
              .includes(search);

          const matchesType =
            type === 'all' ||
            item.type === type;

          const matchesCategory =
            category === 'all' ||
            item.category === category;

          return (
            matchesSearch &&
            matchesType &&
            matchesCategory
          );
        })
        .sort(
          (a, b) =>
            String(b.date).localeCompare(
              String(a.date)
            )
        );

    if (!list.length) {
      table.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma movimentação encontrada.</p>
        </div>
      `;

      return;
    }

    table.innerHTML = list
      .map(item => {
        const info =
          categoryInfo(
            item.category,
            item.type
          );

        const amount =
          Number(item.amount || 0);

        return `
          <div class="transaction-row">
            <div class="transaction-icon">
              ${safeText(info.icon)}
            </div>

            <div class="transaction-main">
              <strong>
                ${safeText(item.description || info.label)}
              </strong>

              <small>
                ${safeText(info.label)} · ${formatDate(item.date)}
              </small>
            </div>

            <div class="transaction-amount ${item.type}">
              ${item.type === 'income' ? '+' : '-'}
              ${money(amount)}
            </div>

            <div class="transaction-actions">
              <button
                type="button"
                data-action="edit-transaction"
                data-id="${safeText(item.id)}"
              >
                Editar
              </button>

              <button
                type="button"
                data-action="delete-transaction"
                data-id="${safeText(item.id)}"
              >
                Excluir
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderInstallments() {
    const container = $('#installmentList');

    if (!container) return;

    const list =
      [...state.installments]
        .sort(
          (a, b) =>
            String(a.startDate || '')
              .localeCompare(
                String(b.startDate || '')
              )
        );

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma compra parcelada cadastrada.</p>
        </div>
      `;

      return;
    }

    container.innerHTML = list
      .map(item => `
        <div class="installment-item">
          <div>
            <strong>
              ${safeText(item.description || 'Parcelamento')}
            </strong>

            <small>
              ${Number(item.count || 0)} parcelas
              · ${money(item.amount)}
            </small>
          </div>

          <div class="transaction-actions">
            <button
              type="button"
              data-action="view-installment"
              data-id="${safeText(item.id)}"
            >
              Ver
            </button>

            <button
              type="button"
              data-action="delete-installment"
              data-id="${safeText(item.id)}"
            >
              Excluir
            </button>
          </div>
        </div>
      `)
      .join('');
  }

  function renderBudgets() {
    const container = $('#budgetGrid');

    if (!container) return;

    const budgets =
      state.budgets.filter(
        budget =>
          !budget.month ||
          budget.month === selectedMonth
      );

    if (!budgets.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Nenhum orçamento cadastrado.</p>
        </div>
      `;

      return;
    }

    container.innerHTML = budgets
      .map(budget => {
        const spent =
          sum(
            expensesInMonth(
              selectedMonth,
              budget.category
            )
          );

        const limit =
          Number(budget.amount || 0);

        const percent =
          limit > 0
            ? Math.min((spent / limit) * 100, 100)
            : 0;

        return `
          <div class="budget-card">
            <div>
              <strong>
                ${safeText(displayName(budget.category))}
              </strong>

              <small>
                ${money(spent)} de ${money(limit)}
              </small>
            </div>

            <div class="budget-progress">
              <span style="width:${percent}%"></span>
            </div>

            <div class="transaction-actions">
              <button
                type="button"
                data-action="edit-budget"
                data-id="${safeText(budget.id)}"
              >
                Editar
              </button>

              <button
                type="button"
                data-action="delete-budget"
                data-id="${safeText(budget.id)}"
              >
                Excluir
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderSettings() {
    const user = auth.currentUser;

    const email =
      $('#settingsEmail');

    if (email && user) {
      email.textContent =
        user.email || '';
    }
  }

  function renderAlerts() {
    const container = $('#alertList');

    if (!container) return;

    const alerts = [];

    state.budgets.forEach(budget => {
      const spent =
        sum(
          expensesInMonth(
            selectedMonth,
            budget.category
          )
        );

      const limit =
        Number(budget.amount || 0);

      if (
        limit > 0 &&
        spent >= limit
      ) {
        alerts.push({
          type: 'danger',
          text: `${displayName(budget.category)} atingiu o limite de ${money(limit)}.`
        });
      } else if (
        limit > 0 &&
        spent >= limit * 0.8
      ) {
        alerts.push({
          type: 'warning',
          text: `${displayName(budget.category)} já consumiu ${money(spent)} de ${money(limit)}.`
        });
      }
    });

    if (!alerts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Nenhum alerta no momento.</p>
        </div>
      `;

      return;
    }

    container.innerHTML = alerts
      .map(
        alert => `
          <div class="alert-item ${alert.type}">
            ${safeText(alert.text)}
          </div>
        `
      )
      .join('');
  }

  function openTransactionForm(type = 'expense', item = null) {
    selectedTransactionType = type;

    $('#transactionId').value =
      item?.id || '';

    $('#transactionDescription').value =
      item?.description || '';

    $('#transactionAmount').value =
      item?.amount ?? '';

    $('#transactionDate').value =
      item?.date || dateString();

    $('#transactionPayment').value =
      item?.payment || 'Pix';

    $('#transactionStatus').value =
      item?.status ||
      (type === 'income'
        ? 'received'
        : 'paid');

    fillSelect(
      $('#transactionCategory'),
      categories[type],
      item?.category || null
    );

    setTransactionType(type);

    $('#transactionDialogTitle').textContent =
      item
        ? 'Editar movimentação'
        : `Adicionar ${type === 'income' ? 'receita' : 'despesa'}`;

    openDialog('transactionDialog');
  }

  async function saveTransaction(event) {
    event.preventDefault();

    const id =
      $('#transactionId').value ||
      newId();

    const item = {
      id,
      type: selectedTransactionType,
      description:
        $('#transactionDescription').value.trim(),
      amount:
        Number($('#transactionAmount').value || 0),
      date:
        $('#transactionDate').value,
      category:
        $('#transactionCategory').value,
      payment:
        $('#transactionPayment').value,
      status:
        $('#transactionStatus').value
    };

    if (!item.description) {
      showToast('Informe uma descrição.');
      return;
    }

    if (item.amount <= 0) {
      showToast('Informe um valor válido.');
      return;
    }

    const index =
      state.transactions.findIndex(
        transaction =>
          transaction.id === id
      );

    if (index >= 0) {
      state.transactions[index] = item;
    } else {
      state.transactions.push(item);
    }

    if (await saveState()) {
      closeDialog('transactionDialog');
      render();
      showToast('Movimentação salva com sucesso.');
    }
  }

  async function deleteTransaction(id) {
    const item =
      state.transactions.find(
        transaction =>
          transaction.id === id
      );

    if (!item) return;

    const confirmed =
      await askForConfirmation({
        title: 'Excluir movimentação?',
        message: `A movimentação "${item.description}" será excluída.`,
        confirmLabel: 'Excluir'
      });

    if (!confirmed) return;

    state.transactions =
      state.transactions.filter(
        transaction =>
          transaction.id !== id
      );

    if (await saveState()) {
      render();
      showToast('Movimentação excluída.');
    }
  }

  function openInstallmentForm() {
    $('#installmentId').value = '';
    $('#installmentDescription').value = '';
    $('#installmentAmount').value = '';
    $('#installmentCount').value = '2';
    $('#installmentPaid').value = '0';

    updateInstallmentPreview();

    openDialog('installmentDialog');
  }

  function openInstallmentFromExpense() {
    closeDialog('transactionDialog');

    openInstallmentForm();
  }

  function updateInstallmentPreview() {
    const amount =
      Number($('#installmentAmount').value || 0);

    const count =
      Number($('#installmentCount').value || 0);

    const preview =
      $('#installmentPreview');

    if (!preview) return;

    if (
      amount <= 0 ||
      count <= 0
    ) {
      preview.textContent =
        'Informe o valor e a quantidade de parcelas.';

      return;
    }

    const installment =
      amount / count;

    preview.textContent =
      `${count} parcelas de ${money(installment)}`;
  }

  async function saveInstallment(event) {
    event.preventDefault();

    const id =
      $('#installmentId').value ||
      newId();

    const amount =
      Number($('#installmentAmount').value || 0);

    const count =
      Number($('#installmentCount').value || 0);

    const paid =
      Number($('#installmentPaid').value || 0);

    const description =
      $('#installmentDescription').value.trim();

    if (!description) {
      showToast('Informe uma descrição.');
      return;
    }

    if (
      amount <= 0 ||
      count <= 0
    ) {
      showToast('Informe valores válidos.');
      return;
    }

    const item = {
      id,
      description,
      amount,
      count,
      paid
    };

    const index =
      state.installments.findIndex(
        installment =>
          installment.id === id
      );

    if (index >= 0) {
      state.installments[index] = item;
    } else {
      state.installments.push(item);
    }

    if (await saveState()) {
      closeDialog('installmentDialog');
      render();
      showToast('Parcelamento salvo com sucesso.');
    }
  }

  async function deletePlan(id) {
    const item =
      state.installments.find(
        installment =>
          installment.id === id
      );

    if (!item) return;

    const confirmed =
      await askForConfirmation({
        title: 'Excluir parcelamento?',
        message: `O parcelamento "${item.description}" será excluído.`,
        confirmLabel: 'Excluir'
      });

    if (!confirmed) return;

    state.installments =
      state.installments.filter(
        installment =>
          installment.id !== id
      );

    if (await saveState()) {
      render();
      showToast('Parcelamento excluído.');
    }
  }

  function openBudgetForm(item = null) {
    $('#budgetId').value =
      item?.id || '';

    $('#budgetAmount').value =
      item?.amount ?? '';

    fillSelect(
      $('#budgetCategory'),
      categories.expense,
      item?.category || null
    );

    $('#budgetMonth').value =
      item?.month || selectedMonth;

    openDialog('budgetDialog');
  }

  async function saveBudget(event) {
    event.preventDefault();

    const id =
      $('#budgetId').value ||
      newId();

    const amount =
      Number($('#budgetAmount').value || 0);

    const category =
      $('#budgetCategory').value;

    const month =
      $('#budgetMonth').value ||
      selectedMonth;

    if (amount <= 0) {
      showToast('Informe um valor válido.');
      return;
    }

    const item = {
      id,
      amount,
      category,
      month
    };

    const index =
      state.budgets.findIndex(
        budget =>
          budget.id === id
      );

    if (index >= 0) {
      state.budgets[index] = item;
    } else {
      state.budgets.push(item);
    }

    if (await saveState()) {
      closeDialog('budgetDialog');
      render();
      showToast('Orçamento salvo com sucesso.');
    }
  }

  async function deleteBudget(id) {
    const item =
      state.budgets.find(
        budget =>
          budget.id === id
      );

    if (!item) return;

    const confirmed =
      await askForConfirmation({
        title: 'Excluir orçamento?',
        message: `O orçamento de ${displayName(item.category)} será excluído.`,
        confirmLabel: 'Excluir'
      });

    if (!confirmed) return;

    state.budgets =
      state.budgets.filter(
        budget =>
          budget.id !== id
      );

    if (await saveState()) {
      render();
      showToast('Orçamento excluído.');
    }
  }

  async function clearData() {
    const confirmed =
      await askForConfirmation({
        title: 'Apagar seus dados?',
        message: 'Todas as suas movimentações, parcelas e orçamentos serão apagados.',
        confirmLabel: 'Apagar tudo'
      });

    if (!confirmed) return;

    const user = auth.currentUser;

    if (!user) {
      showToast('Faça login para continuar.');
      return;
    }

    try {
      await remove(
        ref(db, `users/${user.uid}/state`)
      );

      state = makeEmptyState();

      render();

      showToast('Seus dados foram apagados.');
    } catch (error) {
      console.error(error);

      showToast(
        'Não foi possível apagar os dados.'
      );
    }
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      user: auth.currentUser?.email || '',
      state
    };

    const blob =
      new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
      );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = url;

    link.download =
      `meu-saldo-${dateString()}.json`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    showToast('Dados exportados com sucesso.');
  }

  async function enableReminders() {
    state.settings.notificationsEnabled = true;

    if (await saveState()) {
      showToast(
        'Lembretes ativados para esta conta.'
      );

      renderSettings();
    }
  }

  function handleAction(event) {
    const button =
      event.target.closest('[data-action]');

    if (!button) return;

    const action =
      button.dataset.action;

    const id =
      button.dataset.id;

    if (action === 'edit-transaction') {
      const item =
        state.transactions.find(
          transaction =>
            transaction.id === id
        );

      if (item) {
        openTransactionForm(
          item.type,
          item
        );
      }
    }

    if (action === 'delete-transaction') {
      deleteTransaction(id);
    }

    if (action === 'delete-installment') {
      deletePlan(id);
    }

    if (action === 'view-installment') {
      const plan =
        state.installments.find(
          item =>
            item.id === id
        );

      if (plan) {
        $('#searchInput').value =
          plan.description;

        $('#typeFilter').value = 'all';

        $('#categoryFilter').value =
          'all';

        setPage('transactions');

        renderTransactions();
      }
    }

    if (action === 'edit-budget') {
      const budget =
        state.budgets.find(
          item =>
            item.id === id
        );

      if (budget) {
        openBudgetForm(budget);
      }
    }

    if (action === 'delete-budget') {
      deleteBudget(id);
    }
  }

  function clearDemoCredentials() {
    [
      'demoFullName',
      'demoEmail',
      'demoPassword',
      'demoCpf',
      'demoLoginEmail',
      'demoLoginPassword'
    ].forEach(id => {
      const input =
        document.getElementById(id);

      if (input) {
        input.value = '';
      }
    });
  }

  function setDemoAuthMode(mode) {
    const registering =
      mode !== 'login';

    clearDemoCredentials();

    $('#registerFields').hidden =
      !registering;

    $('#loginFields').hidden =
      registering;

    $('#registerMode').classList.toggle(
      'active',
      registering
    );

    $('#loginMode').classList.toggle(
      'active',
      !registering
    );

    $('#registerMode').setAttribute(
      'aria-selected',
      String(registering)
    );

    $('#loginMode').setAttribute(
      'aria-selected',
      String(!registering)
    );

    $('#authTitle').textContent =
      registering
        ? 'Crie sua conta'
        : 'Entre na sua conta';

    $('#authSubtitle').textContent =
      registering
        ? 'Sua conta será usada para salvar e recuperar seus dados.'
        : 'Entre com o e-mail e a senha cadastrados.';

    $('#demoOpenApp').innerHTML =
      registering
        ? 'Criar conta e abrir painel <span aria-hidden="true">→</span>'
        : 'Entrar no painel <span aria-hidden="true">→</span>';
  }

  function firebaseErrorMessage(error) {
    const messages = {
      'auth/email-already-in-use':
        'Este e-mail já está cadastrado.',

      'auth/invalid-email':
        'Digite um e-mail válido.',

      'auth/weak-password':
        'A senha precisa ter pelo menos 6 caracteres.',

      'auth/invalid-credential':
        'E-mail ou senha incorretos.',

      'auth/user-not-found':
        'E-mail ou senha incorretos.',

      'auth/wrong-password':
        'E-mail ou senha incorretos.',

      'auth/too-many-requests':
        'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    };

    return (
      messages[error?.code] ||
      'Não foi possível concluir a operação. Tente novamente.'
    );
  }

  async function openDemoApp() {
    const registerMode =
      !$('#registerFields').hidden;

    const button =
      $('#demoOpenApp');

    button.disabled = true;

    try {
      if (registerMode) {
        const name =
          $('#demoFullName').value.trim();

        const email =
          $('#demoEmail').value.trim();

        const password =
          $('#demoPassword').value;

        const cpf =
          $('#demoCpf').value.trim();

        if (!name || !email || !password) {
          showToast(
            'Preencha nome, e-mail e senha.'
          );

          return;
        }

        if (password.length < 6) {
          showToast(
            'A senha precisa ter pelo menos 6 caracteres.'
          );

          return;
        }

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );

        await updateProfile(
          credential.user,
          {
            displayName: name
          }
        );

        await set(
          ref(
            db,
            `users/${credential.user.uid}/profile`
          ),
          {
            name,
            email,
            cpf: cpf || '',
            createdAt:
              new Date().toISOString()
          }
        );

        state =
          makeEmptyState();

        await saveState();

      } else {
        const email =
          $('#demoLoginEmail').value.trim();

        const password =
          $('#demoLoginPassword').value;

        if (!email || !password) {
          showToast(
            'Preencha e-mail e senha.'
          );

          return;
        }

        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
      }

      clearDemoCredentials();

      $('#authScreen').hidden = true;

      $('#appShell').hidden = false;

      window.scrollTo({
        top: 0,
        behavior: 'instant'
      });

    } catch (error) {
      console.error(error);

      showToast(
        firebaseErrorMessage(error)
      );

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

    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }

  function bindEvents() {
    $('#registerMode').addEventListener(
      'click',
      () =>
        setDemoAuthMode('register')
    );

    $('#loginMode').addEventListener(
      'click',
      () =>
        setDemoAuthMode('login')
    );

    $('#demoOpenApp').addEventListener(
      'click',
      openDemoApp
    );

    $('#demoBackButton').addEventListener(
      'click',
      returnToDemoAuth
    );

    setDemoAuthMode('register');

    $('#monthPicker').value =
      selectedMonth;

    $('#monthPicker').addEventListener(
      'change',
      updateMonth
    );

    $$('.nav-link[data-view]').forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            setPage(button.dataset.view)
        )
    );

    $$('[data-goto]').forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            setPage(button.dataset.goto)
        )
    );

    $('#addExpenseButton').addEventListener(
      'click',
      () =>
        openTransactionForm('expense')
    );

    $('#addIncomeButton').addEventListener(
      'click',
      () =>
        openTransactionForm('income')
    );

    $('#viewAddIncome').addEventListener(
      'click',
      () =>
        openTransactionForm('income')
    );

    $('#viewAddExpense').addEventListener(
      'click',
      () =>
        openTransactionForm('expense')
    );

    $('#emptyAddButton').addEventListener(
      'click',
      () =>
        openTransactionForm('expense')
    );

    $('#transactionForm').addEventListener(
      'submit',
      saveTransaction
    );

    $$('[data-transaction-type]').forEach(
      button =>
        button.addEventListener(
          'click',
          () =>
            setTransactionType(
              button.dataset.transactionType
            )
        )
    );

    $('#transactionPayment').addEventListener(
      'change',
      handleTransactionPaymentChange
    );

    $('#openInstallmentFromExpense').addEventListener(
      'click',
      openInstallmentFromExpense
    );

    $('#addInstallmentButton').addEventListener(
      'click',
      openInstallmentForm
    );

    $('#emptyInstallmentButton').addEventListener(
      'click',
      openInstallmentForm
    );

    $('#installmentGridPrev').addEventListener(
      'click',
      () => {
        installmentWindowOffset -= 6;
        renderInstallments();
      }
    );

    $('#installmentGridNext').addEventListener(
      'click',
      () => {
        installmentWindowOffset += 6;
        renderInstallments();
      }
    );

    $('#installmentGridReset').addEventListener(
      'click',
      () => {
        installmentWindowOffset = 0;
        renderInstallments();
      }
    );

    $('#installmentForm').addEventListener(
      'submit',
      saveInstallment
    );

    [
      'installmentAmount',
      'installmentCount',
      'installmentPaid'
    ].forEach(id => {
      document
        .getElementById(id)
        .addEventListener(
          'input',
          updateInstallmentPreview
        );
    });

    $('#addBudgetButton').addEventListener(
      'click',
      () =>
        openBudgetForm()
    );

    $('#emptyBudgetButton').addEventListener(
      'click',
      () =>
        openBudgetForm()
    );

    $('#budgetForm').addEventListener(
      'submit',
      saveBudget
    );

    [
      'searchInput',
      'typeFilter',
      'categoryFilter'
    ].forEach(id => {
      document
        .getElementById(id)
        .addEventListener(
          'input',
          renderTransactions
        );
    });

    $('#typeFilter').addEventListener(
      'change',
      () => {
        updateCategoryFilter();
        renderTransactions();
      }
    );

    $('#transactionsTable').addEventListener(
      'click',
      handleAction
    );

    $('#alertList').addEventListener(
      'click',
      handleAction
    );

    $('#installmentList').addEventListener(
      'click',
      handleAction
    );

    $('#budgetGrid').addEventListener(
      'click',
      handleAction
    );

    $('#exportButton').addEventListener(
      'click',
      exportData
    );

    $('#privacyExport').addEventListener(
      'click',
      exportData
    );

    $('#clearButton').addEventListener(
      'click',
      clearData
    );

    $('#privacyClear').addEventListener(
      'click',
      clearData
    );

    $('#confirmationCancel').addEventListener(
      'click',
      () =>
        finishConfirmation(false)
    );

    $('#confirmationAccept').addEventListener(
      'click',
      () =>
        finishConfirmation(true)
    );

    $('#confirmationDialog').addEventListener(
      'cancel',
      event => {
        event.preventDefault();
        finishConfirmation(false);
      }
    );

    $('#reminderButton').addEventListener(
      'click',
      enableReminders
    );

    $('#menuToggle').addEventListener(
      'click',
      () => {
        const sidebar =
          $('#sidebar');

        const expanded =
          sidebar.classList.toggle('open');

        $('#menuToggle').setAttribute(
          'aria-expanded',
          String(expanded)
        );
      }
    );

    document.addEventListener(
      'click',
      event => {
        const closer =
          event.target.closest('[data-close]');

        if (closer) {
          closeDialog(
            closer.dataset.close
          );
        }
      }
    );

    document
      .querySelectorAll('dialog.modal')
      .forEach(dialog =>
        dialog.addEventListener(
          'click',
          event => {
            if (event.target !== dialog) {
              return;
            }

            if (
              dialog.id ===
              'confirmationDialog'
            ) {
              finishConfirmation(false);
            } else {
              dialog.close();
            }
          }
        )
      );

    window.setInterval(
      () => {
        if (!document.hidden) {
          renderAlerts();
        }
      },
      60000
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          renderAlerts();
        }
      }
    );
  }

  bindEvents();

  updateCategoryFilter();

  onAuthStateChanged(
    auth,
    async user => {
      if (!user) {
        state =
          makeEmptyState();

        $('#authScreen').hidden =
          false;

        $('#appShell').hidden =
          true;

        return;
      }

      try {
        state =
          await loadState();

        $('#authScreen').hidden =
          true;

        $('#appShell').hidden =
          false;

        const profileName =
          user.displayName ||
          user.email?.split('@')[0] ||
          'Meu espaço';

        const profileStrong =
          $('.profile strong');

        const profileSmall =
          $('.profile small');

        const avatar =
          $('.avatar');

        if (profileStrong) {
          profileStrong.textContent =
            profileName;
        }

        if (profileSmall) {
          profileSmall.textContent =
            user.email ||
            'Conta Firebase';
        }

        if (avatar) {
          avatar.textContent =
            profileName
              .split(/\s+/)
              .map(part => part[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();
        }

        render();

      } catch (error) {
        console.error(error);

        showToast(
          'Erro ao carregar sua conta.'
        );
      }
    }
  );

})();