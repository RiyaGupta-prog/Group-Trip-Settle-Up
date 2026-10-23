const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'tripsplit_v1';

const defaultState = {
  tripName: 'Weekend Getaway',
  currency: '₹',
  members: [],
  expenses: []
};

let state = loadState();

function loadState() {
  try {
    return {
      ...defaultState,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(n) {
  return state.currency + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();
}

/* THEME STYLES */
function addThemeStyles() {
  if ($('tripSplitThemeStyles')) return;

  const style = document.createElement('style');
  style.id = 'tripSplitThemeStyles';

  style.textContent = `
    body.dark-mode {
      background: #111827 !important;
      color: #f3f4f6 !important;
      color-scheme: dark;
    }

    body.dark-mode header,
    body.dark-mode main,
    body.dark-mode section,
    body.dark-mode article,
    body.dark-mode .card,
    body.dark-mode .panel,
    body.dark-mode .stat-card,
    body.dark-mode .expense-row,
    body.dark-mode .settlement,
    body.dark-mode .member-chip {
      background-color: #1f2937 !important;
      color: #f3f4f6 !important;
      border-color: #374151 !important;
    }

    body.dark-mode input,
    body.dark-mode select,
    body.dark-mode textarea {
      background-color: #111827 !important;
      color: #f9fafb !important;
      border-color: #4b5563 !important;
    }

    body.dark-mode input::placeholder,
    body.dark-mode textarea::placeholder {
      color: #9ca3af !important;
    }

    body.dark-mode label,
    body.dark-mode p,
    body.dark-mode h1,
    body.dark-mode h2,
    body.dark-mode h3,
    body.dark-mode span,
    body.dark-mode .muted,
    body.dark-mode .expense-meta {
      color: inherit;
    }

    body.dark-mode button {
      border-color: #4b5563;
    }

    #themeToggle {
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid #d1d5db;
      cursor: pointer;
      margin: 8px 5px 8px 0;
      font-weight: 600;
    }

    #downloadPDF, #downloadBill {
      padding: 11px 15px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      margin: 8px 5px 8px 0;
      font-weight: 600;
    }
  `;

  document.head.appendChild(style);
}

function ensureExtraButtons() {
  const reset = $('resetTrip');
  if (!reset) return;

  if (!$('themeToggle')) {
    const themeBtn = document.createElement('button');
    themeBtn.id = 'themeToggle';
    themeBtn.type = 'button';
    document.body.classList.toggle(
      'dark-mode',
      localStorage.getItem('tripsplit_theme') === 'dark'
    );

    themeBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('tripsplit_theme', isDark ? 'dark' : 'light');
      updateThemeButton();
    });

    reset.insertAdjacentElement('beforebegin', themeBtn);
    updateThemeButton();
  }

  if (!$('downloadPDF')) {
    const pdfBtn = document.createElement('button');
    pdfBtn.id = 'downloadPDF';
    pdfBtn.type = 'button';
    pdfBtn.textContent = '📄 Download PDF Bill';
    pdfBtn.addEventListener('click', downloadPDF);
    reset.insertAdjacentElement('beforebegin', pdfBtn);
  }

  if (!$('downloadBill')) {
    const csvBtn = document.createElement('button');
    csvBtn.id = 'downloadBill';
    csvBtn.type = 'button';
    csvBtn.textContent = '⬇ Download CSV Bill';
    csvBtn.addEventListener('click', downloadCSV);
    reset.insertAdjacentElement('beforebegin', csvBtn);
  }
}

function updateThemeButton() {
  const btn = $('themeToggle');
  if (!btn) return;

  btn.textContent = document.body.classList.contains('dark-mode')
    ? '☀️ Switch to White Mode'
    : '🌙 Switch to Dark Mode';
}

/* PDF BILL */
function downloadPDF() {
  const balances = calculateBalances();
  const settlements = getSettlements(balances);
  const total = state.expenses.reduce((sum, e) => sum + e.amount, 0);

  const expenseRows = state.expenses.map(e => {
    const payer = state.members.find(m => m.id === e.paidBy);
    const participants = e.splitIds
      .map(id => state.members.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    return `
      <tr>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(payer?.name || 'Removed member')}</td>
        <td>${escapeHtml(money(e.amount))}</td>
        <td>${escapeHtml(participants || 'None')}</td>
      </tr>`;
  }).join('');

  const balanceRows = state.members.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(money(balances.get(m.id) || 0))}</td>
    </tr>
  `).join('');

  const settlementRows = settlements.length
    ? settlements.map(s => `
        <tr>
          <td>${escapeHtml(s.from.name)}</td>
          <td>${escapeHtml(s.to.name)}</td>
          <td>${escapeHtml(money(s.amount))}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3">Everyone is settled up!</td></tr>';

  const win = window.open('', '_blank');

  if (!win) {
    alert('Please allow pop-ups for this site, then try again.');
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TripSplit Bill</title>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 28px;
          color: #222;
        }
        h1 { color: #2563eb; margin-bottom: 4px; }
        h2 { margin-top: 28px; }
        .sub { color: #666; margin-bottom: 24px; }
        .total {
          padding: 16px;
          background: #eff6ff;
          border-radius: 10px;
          font-size: 20px;
          font-weight: bold;
          margin: 20px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: left;
          overflow-wrap: anywhere;
        }
        th { background: #f3f4f6; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>TripSplit</h1>
      <div class="sub">Group Trip Settlement Bill</div>
      <p><strong>Trip:</strong> ${escapeHtml(state.tripName)}</p>
      <p><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</p>
      <p><strong>Members:</strong> ${state.members.length}</p>

      <div class="total">Total Spent: ${escapeHtml(money(total))}</div>

      <h2>Expense Details</h2>
      <table>
        <thead>
          <tr><th>Expense</th><th>Paid By</th><th>Amount</th><th>Split Between</th></tr>
        </thead>
        <tbody>
          ${expenseRows || '<tr><td colspan="4">No expenses recorded.</td></tr>'}
        </tbody>
      </table>

      <h2>Member Balances</h2>
      <table>
        <thead><tr><th>Member</th><th>Balance</th></tr></thead>
        <tbody>
          ${balanceRows || '<tr><td colspan="2">No members added.</td></tr>'}
        </tbody>
      </table>

      <h2>Suggested Settlements</h2>
      <table>
        <thead><tr><th>From</th><th>To</th><th>Amount</th></tr></thead>
        <tbody>${settlementRows}</tbody>
      </table>

      <p class="sub">Generated by TripSplit.</p>
      <button class="no-print" onclick="window.print()">
        Print / Save as PDF
      </button>

      <script>
        window.onload = () => setTimeout(() => window.print(), 400);
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}

/* CSV BILL */
function downloadCSV() {
  const balances = calculateBalances();
  const settlements = getSettlements(balances);
  const total = state.expenses.reduce((sum, e) => sum + e.amount, 0);

  const rows = [
    ['TripSplit Bill'],
    ['Trip Name', state.tripName],
    ['Date', new Date().toLocaleDateString()],
    ['Total Spent', money(total)],
    [],
    ['Expense', 'Paid By', 'Amount', 'Split Between']
  ];

  state.expenses.forEach(e => {
    const payer = state.members.find(m => m.id === e.paidBy);
    const names = e.splitIds
      .map(id => state.members.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    rows.push([
      e.title,
      payer?.name || 'Removed member',
      money(e.amount),
      names
    ]);
  });

  rows.push([], ['Member Balances'], ['Name', 'Balance']);

  state.members.forEach(m => {
    rows.push([m.name, money(balances.get(m.id) || 0)]);
  });

  rows.push([], ['Suggested Settlements'], ['From', 'To', 'Amount']);

  settlements.forEach(s => {
    rows.push([s.from.name, s.to.name, money(s.amount)]);
  });

  const csv = rows.map(row =>
    row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"')
      .join(',')
  ).join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'TripSplit-Bill.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function iconFor(title) {
  const t = title.toLowerCase();

  if (/food|dinner|lunch|breakfast|restaurant|snack|coffee|pizza/.test(t)) return '🍽️';
  if (/hotel|stay|room|hostel/.test(t)) return '🛏️';
  if (/taxi|cab|uber|bus|train|fuel|petrol|travel/.test(t)) return '🚕';
  if (/ticket|entry|museum|activity/.test(t)) return '🎟️';
  if (/shop|gift/.test(t)) return '🛍️';

  return '🧾';
}

function calculateBalances() {
  const balances = new Map(state.members.map(m => [m.id, 0]));

  for (const e of state.expenses) {
    if (balances.has(e.paidBy)) {
      balances.set(e.paidBy, balances.get(e.paidBy) + e.amount);
    }

    const participants = e.splitIds.filter(id => balances.has(id));
    if (!participants.length) continue;

    if (e.splitType === 'custom' && e.customShares) {
      participants.forEach(id => {
        balances.set(
          id,
          balances.get(id) - (Number(e.customShares[id]) || 0)
        );
      });
    } else {
      const share = e.amount / participants.length;

      participants.forEach(id => {
        balances.set(id, balances.get(id) - share);
      });
    }
  }

  return balances;
}

function getSettlements(balances) {
  const creditors = [];
  const debtors = [];

  for (const m of state.members) {
    const amount = balances.get(m.id) || 0;

    if (amount > 0.005) creditors.push({ member: m, amount });
    else if (amount < -0.005) debtors.push({ member: m, amount: -amount });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);

    if (amount > 0.005) {
      result.push({
        from: debtors[i].member,
        to: creditors[j].member,
        amount
      });
    }

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }

  return result;
}

function renderCustomSplitInputs() {
  const container = $('customSplitInputs');
  if (!container) return;

  const existing = new Map(
    [...container.querySelectorAll('.custom-share')]
      .map(input => [input.dataset.memberId, input.value])
  );

  container.innerHTML = state.members.map(m => `
    <div class="field">
      <label>${escapeHtml(m.name)}</label>
      <input type="number" min="0" step="0.01"
        class="custom-share"
        data-member-id="${m.id}"
        placeholder="0.00"
        value="${existing.get(m.id) || ''}">
    </div>
  `).join('');
}

function render() {
  if ($('tripName')) $('tripName').value = state.tripName;
  if ($('currency')) $('currency').value = state.currency;

  const total = state.expenses.reduce((s, e) => s + e.amount, 0);

  $('totalSpent').textContent = money(total);
  $('peopleCount').textContent = state.members.length;
  $('expenseCount').textContent = state.expenses.length;
  $('memberPill').textContent =
    `${state.members.length} member${state.members.length === 1 ? '' : 's'}`;

  $('membersList').innerHTML = state.members.length
    ? state.members.map(m => `
      <span class="member-chip">
        <span class="avatar">${escapeHtml(initials(m.name))}</span>
        ${escapeHtml(m.name)}
        <button class="remove-member" type="button"
          data-remove-member="${m.id}">×</button>
      </span>
    `).join('')
    : '<p class="empty">Add your group members to get started.</p>';

  $('paidBy').innerHTML = state.members.length
    ? state.members.map(m =>
        `<option value="${m.id}">${escapeHtml(m.name)}</option>`
      ).join('')
    : '<option value="">Add a person first</option>';

  $('splitMembers').innerHTML = state.members.length
    ? state.members.map(m => `
      <label class="split-option">
        <input type="checkbox" name="splitMember" value="${m.id}" checked>
        ${escapeHtml(m.name)}
      </label>
    `).join('')
    : '<span class="muted">Add members first.</span>';

  const splitType = $('splitType');
  if (splitType) {
    $('customSplitFields').style.display =
      splitType.value === 'custom' ? 'block' : 'none';
    renderCustomSplitInputs();
  }

  $('expensesList').innerHTML = state.expenses.length
    ? [...state.expenses].reverse().map(e => {
        const payer = state.members.find(m => m.id === e.paidBy);

        return `
          <div class="expense-row">
            <div class="expense-left">
              <div class="expense-icon">${iconFor(e.title)}</div>
              <div>
                <div class="expense-title">${escapeHtml(e.title)}</div>
                <div class="expense-meta">
                  Paid by ${escapeHtml(payer?.name || 'Removed member')}
                  · Split between ${e.splitIds.length}
                </div>
              </div>
            </div>
            <div class="expense-right">
              <div class="expense-amount">${money(e.amount)}</div>
              <button class="delete-expense"
                data-delete-expense="${e.id}">Remove</button>
            </div>
          </div>
        `;
      }).join('')
    : '<p class="empty">Your expenses will appear here.</p>';

  const balances = calculateBalances();

  $('balancesList').innerHTML = state.members.length
    ? state.members.map(m => {
        const b = balances.get(m.id) || 0;

        return `
          <div class="balance-row">
            <div class="balance-person">
              <span class="avatar">${escapeHtml(initials(m.name))}</span>
              ${escapeHtml(m.name)}
            </div>
            <span class="balance-value ${
              b > 0.005 ? 'positive' : b < -0.005 ? 'negative' : ''
            }">
              ${b > 0.005 ? '+' : ''}${money(b)}
            </span>
          </div>
        `;
      }).join('')
    : '<p class="empty">Add people and expenses to calculate balances.</p>';

  const settlements = getSettlements(balances);

  $('settlementsList').innerHTML = settlements.length
    ? settlements.map(s => `
      <div class="settlement">
        <div class="settlement-top">
          <span>
            ${escapeHtml(s.from.name)}
            <span class="settlement-arrow">→</span>
            ${escapeHtml(s.to.name)}
          </span>
          <strong>${money(s.amount)}</strong>
        </div>
        <div class="settlement-arrow">
          ${escapeHtml(s.from.name)} pays ${escapeHtml(s.to.name)}
        </div>
      </div>
    `).join('')
    : `<p class="empty">${
        state.expenses.length
          ? 'Everyone is settled up. Nice work!'
          : 'Settlements will show up here.'
      }</p>`;

  ensureExtraButtons();
}

$('memberForm').addEventListener('submit', e => {
  e.preventDefault();

  const name = $('memberName').value.trim();
  if (!name) return;

  if (state.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    alert('That person is already in the group.');
    return;
  }

  state.members.push({ id: crypto.randomUUID(), name });
  $('memberName').value = '';

  saveState();
  render();
});

if ($('splitType')) {
  $('splitType').addEventListener('change', () => {
    $('customSplitFields').style.display =
      $('splitType').value === 'custom' ? 'block' : 'none';

    renderCustomSplitInputs();
  });
}

$('expenseForm').addEventListener('submit', e => {
  e.preventDefault();

  if (!state.members.length) {
    alert('Add at least one person first.');
    return;
  }

  const title = $('expenseTitle').value.trim();
  const amount = Number($('expenseAmount').value);
  const paidBy = $('paidBy').value;

  const splitIds = [
    ...document.querySelectorAll('input[name="splitMember"]:checked')
  ].map(x => x.value);

  if (!title || !Number.isFinite(amount) || amount <= 0 || !paidBy || !splitIds.length) {
    alert('Enter a valid expense and select at least one person.');
    return;
  }

  const splitType = $('splitType')?.value || 'equal';
  let customShares = null;

  if (splitType === 'custom') {
    customShares = {};

    document.querySelectorAll('.custom-share').forEach(input => {
      const id = input.dataset.memberId;
      if (splitIds.includes(id)) customShares[id] = Number(input.value);
    });

    const invalid = splitIds.some(id =>
      !Number.isFinite(customShares[id]) || customShares[id] < 0
    );

    const customTotal = splitIds.reduce(
      (sum, id) => sum + (customShares[id] || 0), 0
    );

    if (invalid || Math.abs(customTotal - amount) > 0.01) {
      alert('Selected members ke amounts ka total expense ke equal hona chahiye.');
      return;
    }
  }

  state.expenses.push({
    id: crypto.randomUUID(),
    title,
    amount,
    paidBy,
    splitIds,
    splitType,
    customShares,
    date: new Date().toISOString()
  });

  $('expenseTitle').value = '';
  $('expenseAmount').value = '';

  saveState();
  render();
});

$('tripName').addEventListener('change', () => {
  state.tripName = $('tripName').value.trim() || 'My Trip';
  saveState();
});

$('currency').addEventListener('change', () => {
  state.currency = $('currency').value;
  saveState();
  render();
});

document.addEventListener('click', e => {
  const removeMember = e.target.closest('[data-remove-member]');

  if (removeMember) {
    const id = removeMember.dataset.removeMember;
    const name = state.members.find(m => m.id === id)?.name || 'This person';

    if (!confirm(`Remove ${name}? Their shares will be excluded from balances.`)) return;

    state.members = state.members.filter(m => m.id !== id);
    state.expenses = state.expenses.map(ex => ({
      ...ex,
      splitIds: ex.splitIds.filter(x => x !== id)
    }));

    saveState();
    render();
  }

  const deleteExpense = e.target.closest('[data-delete-expense]');

  if (deleteExpense) {
    state.expenses = state.expenses.filter(
      ex => ex.id !== deleteExpense.dataset.deleteExpense
    );

    saveState();
    render();
  }
});

$('clearExpenses').addEventListener('click', () => {
  if (state.expenses.length && confirm('Delete all expenses? This cannot be undone.')) {
    state.expenses = [];
    saveState();
    render();
  }
});

$('resetTrip').addEventListener('click', () => {
  if (confirm('Reset the entire trip, including all members and expenses?')) {
    state = { ...defaultState, members: [], expenses: [] };
    saveState();
    render();
  }
});

addThemeStyles();
render();
