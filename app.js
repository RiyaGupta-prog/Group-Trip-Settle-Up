'use strict';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'tripsplit_v1';
const THEME_KEY = 'tripsplit_theme';

const defaultState = {
  tripName: 'Weekend Getaway',
  currency: '₹',
  members: [],
  expenses: []
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    return {
      ...defaultState,
      ...saved,
      members: Array.isArray(saved.members) ? saved.members : [],
      expenses: Array.isArray(saved.expenses) ? saved.expenses : []
    };
  } catch {
    return {
      ...defaultState,
      members: [],
      expenses: []
    };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('TripSplit could not save locally:', err);
  }
}

function makeId() {
  return (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  )
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(n) {
  return `${state.currency}${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase();
}

function setMessage(message, isError = false) {
  const box = $('memberMessage');

  if (!box) return;

  box.textContent = message;
  box.classList.toggle('error-message', isError);
  box.hidden = !message;
}

function applyTheme() {
  const dark = localStorage.getItem(THEME_KEY) === 'dark';

  document.body.classList.toggle('dark-mode', dark);

  const btn = $('themeToggle');

  if (btn) {
    btn.textContent = dark ? '☀️ Light mode' : '🌙 Dark mode';
    btn.setAttribute('aria-pressed', String(dark));
  }
}

function iconFor(title) {
  const t = String(title || '').toLowerCase();

  if (/food|dinner|lunch|breakfast|restaurant|snack|coffee|pizza/.test(t)) {
    return '🍽️';
  }

  if (/hotel|stay|room|hostel/.test(t)) {
    return '🛏️';
  }

  if (/taxi|cab|uber|bus|train|fuel|petrol|travel/.test(t)) {
    return '🚕';
  }

  if (/ticket|entry|museum|activity/.test(t)) {
    return '🎟️';
  }

  if (/shop|gift/.test(t)) {
    return '🛍️';
  }

  return '🧾';
}

// Calculate how much each person should receive or pay.
function calculateBalances() {
  const balances = new Map(
    state.members.map(m => [m.id, 0])
  );

  for (const expense of state.expenses) {
    const amount = Number(expense.amount || 0);

    if (balances.has(expense.paidBy)) {
      balances.set(
        expense.paidBy,
        balances.get(expense.paidBy) + amount
      );
    }

    const participants = (
      Array.isArray(expense.splitIds) ? expense.splitIds : []
    ).filter(id => balances.has(id));

    if (!participants.length) continue;

    if (expense.splitType === 'custom' && expense.customShares) {
      participants.forEach(id => {
        balances.set(
          id,
          balances.get(id) -
            (Number(expense.customShares[id]) || 0)
        );
      });
    } else {
      const share = amount / participants.length;

      participants.forEach(id => {
        balances.set(id, balances.get(id) - share);
      });
    }
  }

  return balances;
}

// Generate the minimum practical payment suggestions.
function getSettlements(balances) {
  const creditors = [];
  const debtors = [];

  for (const member of state.members) {
    const amount = balances.get(member.id) || 0;

    if (amount > 0.005) {
      creditors.push({ member, amount });
    } else if (amount < -0.005) {
      debtors.push({ member, amount: -amount });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(
      debtors[i].amount,
      creditors[j].amount
    );

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

// Display inputs for custom expense splitting.
function renderCustomSplitInputs() {
  const container = $('customSplitInputs');

  if (!container) return;

  const existing = new Map(
    [...container.querySelectorAll('.custom-share')].map(input => [
      input.dataset.memberId,
      input.value
    ])
  );

  container.innerHTML = state.members.map(member => `
    <div class="field custom-share-field">
      <label for="share-${escapeHtml(member.id)}">
        ${escapeHtml(member.name)}'s share
      </label>

      <input
        id="share-${escapeHtml(member.id)}"
        class="custom-share"
        data-member-id="${escapeHtml(member.id)}"
        type="number"
        min="0"
        step="0.01"
        placeholder="0.00"
        value="${escapeHtml(existing.get(member.id) || '')}"
      >
    </div>
  `).join('');
}

// Update the complete page.
function render() {
  if ($('tripName')) {
    $('tripName').value = state.tripName;
  }

  if ($('currency')) {
    $('currency').value = state.currency;
  }

  const total = state.expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  if ($('totalSpent')) {
    $('totalSpent').textContent = money(total);
  }

  if ($('peopleCount')) {
    $('peopleCount').textContent = state.members.length;
  }

  if ($('expenseCount')) {
    $('expenseCount').textContent = state.expenses.length;
  }

  if ($('memberPill')) {
    $('memberPill').textContent =
      `${state.members.length} member${state.members.length === 1 ? '' : 's'}`;
  }

  // Members list
  if ($('membersList')) {
    $('membersList').innerHTML = state.members.length
      ? state.members.map(m => `
          <span class="member-chip">
            <span class="avatar">${escapeHtml(initials(m.name))}</span>
            <span class="member-name">${escapeHtml(m.name)}</span>
            <button
              class="remove-member"
              type="button"
              aria-label="Remove ${escapeHtml(m.name)}"
              data-remove-member="${escapeHtml(m.id)}"
            >×</button>
          </span>
        `).join('')
      : '<p class="empty">Add your group members to get started.</p>';
  }

  // Who paid for an expense?
  if ($('paidBy')) {
    $('paidBy').innerHTML = state.members.length
      ? state.members.map(m => `
          <option value="${escapeHtml(m.id)}">
            ${escapeHtml(m.name)}
          </option>
        `).join('')
      : '<option value="">Add a person first</option>';
  }

  // People included in expense splitting
  if ($('splitMembers')) {
    $('splitMembers').innerHTML = state.members.length
      ? state.members.map(m => `
          <label class="split-option">
            <input
              type="checkbox"
              name="splitMember"
              value="${escapeHtml(m.id)}"
              checked
            >
            ${escapeHtml(m.name)}
          </label>
        `).join('')
      : '<span class="muted">Add members first.</span>';
  }

  const splitType = $('splitType');

  if (splitType && $('customSplitFields')) {
    $('customSplitFields').hidden = splitType.value !== 'custom';
  }

  renderCustomSplitInputs();

  // Expenses list
  if ($('expensesList')) {
    $('expensesList').innerHTML = state.expenses.length
      ? [...state.expenses].reverse().map(e => {
          const payer = state.members.find(m => m.id === e.paidBy);

          return `
            <div class="expense-row">
              <div class="expense-left">
                <div class="expense-icon">${iconFor(e.title)}</div>

                <div>
                  <div class="expense-title">
                    ${escapeHtml(e.title)}
                  </div>

                  <div class="expense-meta">
                    Paid by ${escapeHtml(payer?.name || 'Removed member')}
                    · Split between ${(e.splitIds || []).length}
                  </div>
                </div>
              </div>

              <div class="expense-right">
                <div class="expense-amount">
                  ${money(e.amount)}
                </div>

                <button
                  class="delete-expense"
                  type="button"
                  data-delete-expense="${escapeHtml(e.id)}"
                >Remove</button>
              </div>
            </div>
          `;
        }).join('')
      : '<p class="empty">Your expenses will appear here.</p>';
  }

  // Member balances
  const balances = calculateBalances();

  if ($('balancesList')) {
    $('balancesList').innerHTML = state.members.length
      ? state.members.map(m => {
          const balance = balances.get(m.id) || 0;

          return `
            <div class="balance-row">
              <div class="balance-person">
                <span class="avatar">${escapeHtml(initials(m.name))}</span>
                ${escapeHtml(m.name)}
              </div>

              <span class="balance-value ${
                balance > 0.005
                  ? 'positive'
                  : balance < -0.005
                    ? 'negative'
                    : ''
              }">
                ${balance > 0.005 ? '+' : ''}${money(balance)}
              </span>
            </div>
          `;
        }).join('')
      : '<p class="empty">Add people and expenses to calculate balances.</p>';
  }

  // Suggested settlements
  const settlements = getSettlements(balances);

  if ($('settlementsList')) {
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
  }

  // Trip summary
  const average = state.members.length
    ? total / state.members.length
    : 0;

  const largest = state.expenses.reduce(
    (best, e) =>
      !best || Number(e.amount) > Number(best.amount) ? e : best,
    null
  );

  if ($('averagePerPerson')) {
    $('averagePerPerson').textContent = money(average);
  }

  if ($('largestExpense')) {
    $('largestExpense').textContent = largest
      ? `${escapeHtml(largest.title)} · ${money(largest.amount)}`
      : 'No expenses yet';
  }

  if ($('settlementCount')) {
    $('settlementCount').textContent = String(settlements.length);
  }

  if ($('tripSummaryText')) {
    $('tripSummaryText').textContent = !state.members.length
      ? 'Add your travel buddies and expenses to build your trip summary.'
      : `${state.members.length} ${
          state.members.length === 1 ? 'person' : 'people'
        } · ${state.expenses.length} ${
          state.expenses.length === 1 ? 'expense' : 'expenses'
        } · ${
          settlements.length
            ? `${settlements.length} suggested ${
                settlements.length === 1 ? 'payment' : 'payments'
              } to settle up`
            : total
              ? 'Everyone is settled up'
              : 'Ready to track shared costs'
        }.`;
  }

  applyTheme();
}

// Add a person
function addMember(event) {
  event.preventDefault();

  const input = $('memberName');

  if (!input) return;

  const name = input.value.trim().replace(/\s+/g, ' ');

  if (!name) {
    setMessage('Please enter a name.', true);
    input.focus();
    return;
  }

  const alreadyExists = state.members.some(
    m => String(m.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  );

  if (alreadyExists) {
    setMessage(`${name} is already in this trip.`, true);
    input.select();
    return;
  }

  state.members.push({
    id: makeId(),
    name
  });

  input.value = '';

  setMessage(`${name} added successfully.`);

  saveState();
  render();

  input.focus();
}

// Add an expense
function addExpense(event) {
  event.preventDefault();

  if (!state.members.length) {
    alert('Add at least one person first.');
    $('memberName')?.focus();
    return;
  }

  const title = $('expenseTitle').value.trim();
  const amount = Number($('expenseAmount').value);
  const paidBy = $('paidBy').value;

  const splitIds = [
    ...document.querySelectorAll('input[name="splitMember"]:checked')
  ].map(input => input.value);

  if (
    !title ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !paidBy ||
    !splitIds.length
  ) {
    alert('Enter a valid expense and select at least one person to split it with.');
    return;
  }

  const splitType = $('splitType')?.value || 'equal';
  let customShares = null;

  if (splitType === 'custom') {
    customShares = {};

    document.querySelectorAll('.custom-share').forEach(input => {
      if (splitIds.includes(input.dataset.memberId)) {
        customShares[input.dataset.memberId] = Number(input.value);
      }
    });

    const invalid = splitIds.some(id => {
      const input = document.querySelector(
        `.custom-share[data-member-id="${id}"]`
      );

      return (
        !input ||
        input.value === '' ||
        !Number.isFinite(customShares[id]) ||
        customShares[id] < 0
      );
    });

    const customTotal = splitIds.reduce(
      (sum, id) => sum + (Number(customShares[id]) || 0),
      0
    );

    if (invalid || Math.abs(customTotal - amount) > 0.01) {
      alert('The selected members’ custom shares must add up to the full expense amount.');
      return;
    }
  }

  state.expenses.push({
    id: makeId(),
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
}

// Download a printable bill that can be saved as PDF
function downloadPDF() {
  const balances = calculateBalances();
  const settlements = getSettlements(balances);

  const total = state.expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const expenseRows = state.expenses.map(e => {
    const payer = state.members.find(m => m.id === e.paidBy);

    const names = (e.splitIds || [])
      .map(id => state.members.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    return `
      <tr>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(payer?.name || 'Removed member')}</td>
        <td>${escapeHtml(money(e.amount))}</td>
        <td>${escapeHtml(names || 'None')}</td>
      </tr>
    `;
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
    : '<tr><td colspan="3">Everyone is settled up.</td></tr>';

  const win = window.open('', '_blank');

  if (!win) {
    alert('Your browser blocked the bill window. Allow pop-ups for this site and try again.');
    return;
  }

  win.document.open();

  win.document.write(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">

      <title>${escapeHtml(state.tripName)} - TripSplit Bill</title>

      <style>
        body {
          font: 14px Arial, sans-serif;
          color: #222;
          padding: 28px;
          max-width: 1000px;
          margin: auto;
        }

        h1 {
          color: #1d6b52;
          margin-bottom: 4px;
        }

        .sub {
          color: #666;
        }

        .total {
          padding: 15px;
          background: #edf7f0;
          border-radius: 9px;
          font-size: 20px;
          font-weight: bold;
          margin: 20px 0;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0 24px;
          table-layout: fixed;
        }

        th, td {
          border: 1px solid #ddd;
          padding: 9px;
          text-align: left;
          overflow-wrap: anywhere;
        }

        th {
          background: #f1f5f2;
        }

        h2 {
          margin-top: 26px;
          font-size: 18px;
        }

        .actions {
          margin: 20px 0;
        }

        .actions button {
          padding: 10px 14px;
          border: 0;
          border-radius: 7px;
          background: #1d6b52;
          color: white;
          font-weight: bold;
          cursor: pointer;
        }

        @media print {
          body {
            padding: 0;
          }

          .actions {
            display: none;
          }

          tr {
            break-inside: avoid;
          }
        }
      </style>
    </head>

    <body>
      <h1>TripSplit</h1>

      <div class="sub">Group Trip Bill & Settlement Summary</div>

      <p><b>Trip:</b> ${escapeHtml(state.tripName)}</p>
      <p><b>Date generated:</b> ${escapeHtml(new Date().toLocaleDateString())}</p>
      <p><b>Members:</b> ${state.members.length}</p>

      <div class="total">
        Total spent: ${escapeHtml(money(total))}
      </div>

      <h2>Expense details</h2>

      <table>
        <thead>
          <tr>
            <th>Expense</th>
            <th>Paid by</th>
            <th>Amount</th>
            <th>Split between</th>
          </tr>
        </thead>

        <tbody>
          ${expenseRows || '<tr><td colspan="4">No expenses recorded.</td></tr>'}
        </tbody>
      </table>

      <h2>Member balances</h2>

      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Balance (+ receives / − owes)</th>
          </tr>
        </thead>

        <tbody>
          ${balanceRows || '<tr><td colspan="2">No members added.</td></tr>'}
        </tbody>
      </table>

      <h2>Suggested settlements</h2>

      <table>
        <thead>
          <tr>
            <th>Who pays</th>
            <th>Who receives</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          ${settlementRows}
        </tbody>
      </table>

      <div class="actions">
        <button onclick="window.print()">Print / Save as PDF</button>
      </div>

      <p class="sub">Generated by TripSplit.</p>

      <script>
        window.addEventListener('load', () => {
          setTimeout(() => window.print(), 300);
        });
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}

// Download the bill as a CSV file
function downloadCSV() {
  const balances = calculateBalances();
  const settlements = getSettlements(balances);

  const rows = [
    ['TripSplit Bill'],
    ['Trip Name', state.tripName],
    ['Date', new Date().toLocaleDateString()],
    [
      'Total Spent',
      money(
        state.expenses.reduce(
          (sum, e) => sum + Number(e.amount || 0),
          0
        )
      )
    ],
    [],
    ['Expense', 'Paid By', 'Amount', 'Split Between']
  ];

  state.expenses.forEach(e => {
    rows.push([
      e.title,
      state.members.find(m => m.id === e.paidBy)?.name || 'Removed member',
      money(e.amount),
      (e.splitIds || [])
        .map(id => state.members.find(m => m.id === id)?.name)
        .filter(Boolean)
        .join(', ')
    ]);
  });

  rows.push([], ['Member Balances'], ['Name', 'Balance']);

  state.members.forEach(m => {
    rows.push([
      m.name,
      money(balances.get(m.id) || 0)
    ]);
  });

  rows.push([], ['Suggested Settlements'], ['From', 'To', 'Amount']);

  settlements.forEach(s => {
    rows.push([
      s.from.name,
      s.to.name,
      money(s.amount)
    ]);
  });

  const csv = rows
    .map(row =>
      row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    )
    .join('\r\n');

  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;'
    })
  );

  const link = document.createElement('a');

  link.href = url;
  link.download = 'TripSplit-Bill.csv';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Form event listeners
$('memberForm')?.addEventListener('submit', addMember);

$('memberName')?.addEventListener('input', () => {
  setMessage('');
});

$('expenseForm')?.addEventListener('submit', addExpense);

$('splitType')?.addEventListener('change', () => {
  if ($('customSplitFields')) {
    $('customSplitFields').hidden = $('splitType').value !== 'custom';
  }

  renderCustomSplitInputs();
});

$('tripName')?.addEventListener('input', () => {
  state.tripName = $('tripName').value || 'My Trip';
  saveState();
});

$('tripName')?.addEventListener('change', () => {
  state.tripName = $('tripName').value.trim() || 'My Trip';
  $('tripName').value = state.tripName;
  saveState();
});

$('currency')?.addEventListener('change', () => {
  state.currency = $('currency').value;
  saveState();
  render();
});

// Light/Dark mode toggle
$('themeToggle')?.addEventListener('click', () => {
  const next = document.body.classList.contains('dark-mode')
    ? 'light'
    : 'dark';

  localStorage.setItem(THEME_KEY, next);
  applyTheme();
});

// Bill download buttons
$('downloadPDF')?.addEventListener('click', downloadPDF);
$('downloadCSV')?.addEventListener('click', downloadCSV);

// Clear all expenses
$('clearExpenses')?.addEventListener('click', () => {
  if (
    state.expenses.length &&
    confirm('Delete all expenses? This cannot be undone.')
  ) {
    state.expenses = [];
    saveState();
    render();
  }
});

// Reset the entire trip
$('resetTrip')?.addEventListener('click', () => {
  if (
    confirm('Reset the entire trip, including all members and expenses? This cannot be undone.')
  ) {
    state = {
      ...defaultState,
      members: [],
      expenses: []
    };

    saveState();
    render();
  }
});

// Remove members and expenses
document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-member]');

  if (remove) {
    const id = remove.dataset.removeMember;

    const name =
      state.members.find(m => m.id === id)?.name || 'This person';

    if (
      !confirm(
        `Remove ${name}? Their shares will be excluded from balance calculations.`
      )
    ) {
      return;
    }

    state.members = state.members.filter(m => m.id !== id);

    state.expenses = state.expenses.map(e => {
      const customShares = { ...(e.customShares || {}) };

      delete customShares[id];

      return {
        ...e,
        splitIds: (e.splitIds || []).filter(x => x !== id),
        customShares
      };
    });

    saveState();
    render();
  }

  const removeExpense = event.target.closest('[data-delete-expense]');

  if (removeExpense) {
    state.expenses = state.expenses.filter(
      e => e.id !== removeExpense.dataset.deleteExpense
    );

    saveState();
    render();
  }
});

// Initialize the app
applyTheme();
render();
