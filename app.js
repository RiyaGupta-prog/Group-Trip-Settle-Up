const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'tripsplit_v1';
const defaultState = { tripName: 'Weekend Getaway', currency: '₹', members: [], expenses: [] };
let state = loadState();

function loadState() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { ...defaultState }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(n) { return `${state.currency}${Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function initials(name) { return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function render() {
  $('tripName').value = state.tripName;
  $('currency').value = state.currency;
  const total = state.expenses.reduce((s,e)=>s+e.amount,0);
  $('totalSpent').textContent = money(total);
  $('peopleCount').textContent = state.members.length;
  $('expenseCount').textContent = state.expenses.length;
  $('memberPill').textContent = `${state.members.length} member${state.members.length===1?'':'s'}`;

  $('membersList').innerHTML = state.members.length ? state.members.map(m=>`
    <span class="member-chip"><span class="avatar">${escapeHtml(initials(m.name))}</span>${escapeHtml(m.name)}
    <button class="remove-member" type="button" title="Remove ${escapeHtml(m.name)}" data-remove-member="${m.id}">×</button></span>`).join('') : '<p class="empty">Add your group members to get started.</p>';

  $('paidBy').innerHTML = state.members.length ? state.members.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('') : '<option value="">Add a person first</option>';
  $('splitMembers').innerHTML = state.members.length ? state.members.map(m=>`
    <label class="split-option"><input type="checkbox" name="splitMember" value="${m.id}" checked> ${escapeHtml(m.name)}</label>`).join('') : '<span class="muted">Add members first.</span>';

  $('expensesList').innerHTML = state.expenses.length ? [...state.expenses].reverse().map(e=>{
    const payer=state.members.find(m=>m.id===e.paidBy);
    return `<div class="expense-row"><div class="expense-left"><div class="expense-icon">${iconFor(e.title)}</div><div><div class="expense-title">${escapeHtml(e.title)}</div><div class="expense-meta">Paid by ${escapeHtml(payer?.name || 'Removed member')} · Split between ${e.splitIds.length}</div></div></div><div class="expense-right"><div class="expense-amount">${money(e.amount)}</div><button class="delete-expense" data-delete-expense="${e.id}">Remove</button></div></div>`;
  }).join('') : '<p class="empty">Your expenses will appear here.</p>';

  const balances = calculateBalances();
  $('balancesList').innerHTML = state.members.length ? state.members.map(m=>{
    const b=balances.get(m.id)||0;
    return `<div class="balance-row"><div class="balance-person"><span class="avatar">${escapeHtml(initials(m.name))}</span>${escapeHtml(m.name)}</div><span class="balance-value ${b>0.005?'positive':b<-.005?'negative':''}">${b>0.005?'+':''}${money(b)}</span></div>`;
  }).join('') : '<p class="empty">Add people and expenses to calculate balances.</p>';

  const settlements = getSettlements(balances);
  $('settlementsList').innerHTML = settlements.length ? settlements.map(s=>`
    <div class="settlement"><div class="settlement-top"><span>${escapeHtml(s.from.name)} <span class="settlement-arrow">→</span> ${escapeHtml(s.to.name)}</span><strong>${money(s.amount)}</strong></div><div class="settlement-arrow">${escapeHtml(s.from.name)} pays ${escapeHtml(s.to.name)}</div></div>`).join('') : `<p class="empty">${state.expenses.length ? 'Everyone is settled up. Nice work!' : 'Settlements will show up here.'}</p>`;
}
function iconFor(title) {
  const t=title.toLowerCase();
  if(/food|dinner|lunch|breakfast|restaurant|snack|coffee|pizza/.test(t)) return '🍽️';
  if(/hotel|stay|room|hostel/.test(t)) return '🛏️';
  if(/taxi|cab|uber|bus|train|fuel|petrol|travel/.test(t)) return '🚕';
  if(/ticket|entry|museum|activity/.test(t)) return '🎟️';
  if(/shop|gift/.test(t)) return '🛍️';
  return '🧾';
}
function calculateBalances() {
  const b = new Map(state.members.map(m=>[m.id,0]));
  for(const e of state.expenses) {
    if(b.has(e.paidBy)) b.set(e.paidBy,b.get(e.paidBy)+e.amount);
    const participants=e.splitIds.filter(id=>b.has(id));
    if(participants.length) {
      const share=e.amount/participants.length;
      participants.forEach(id=>b.set(id,b.get(id)-share));
    }
  }
  return b;
}
function getSettlements(balances) {
  const creditors=[], debtors=[];
  for(const m of state.members) {
    const amount=balances.get(m.id)||0;
    if(amount>0.005) creditors.push({member:m,amount});
    else if(amount<-.005) debtors.push({member:m,amount:-amount});
  }
  creditors.sort((a,b)=>b.amount-a.amount); debtors.sort((a,b)=>b.amount-a.amount);
  const result=[]; let i=0,j=0;
  while(i<debtors.length && j<creditors.length) {
    const amount=Math.min(debtors[i].amount,creditors[j].amount);
    if(amount>0.005) result.push({from:debtors[i].member,to:creditors[j].member,amount});
    debtors[i].amount-=amount; creditors[j].amount-=amount;
    if(debtors[i].amount<0.005)i++;
    if(creditors[j].amount<0.005)j++;
  }
  return result;
}

$('memberForm').addEventListener('submit', e=>{
  e.preventDefault(); const name=$('memberName').value.trim();
  if(!name) return;
  if(state.members.some(m=>m.name.toLowerCase()===name.toLowerCase())) { alert('That person is already in the group.'); return; }
  state.members.push({id:crypto.randomUUID(),name}); $('memberName').value=''; saveState(); render();
});
$('expenseForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!state.members.length) { alert('Add at least one person first.'); return; }
  const title=$('expenseTitle').value.trim(), amount=Number($('expenseAmount').value), paidBy=$('paidBy').value;
  const splitIds=[...document.querySelectorAll('input[name="splitMember"]:checked')].map(x=>x.value);
  if(!title || !Number.isFinite(amount) || amount<=0 || !paidBy || !splitIds.length) { alert('Enter a valid expense and select at least one person to split it with.'); return; }
  state.expenses.push({id:crypto.randomUUID(),title,amount,paidBy,splitIds,date:new Date().toISOString()});
  $('expenseTitle').value=''; $('expenseAmount').value=''; saveState(); render();
});
$('tripName').addEventListener('change',()=>{state.tripName=$('tripName').value.trim()||'My Trip';saveState();});
$('currency').addEventListener('change',()=>{state.currency=$('currency').value;saveState();render();});
document.addEventListener('click',e=>{
  const removeMember=e.target.closest('[data-remove-member]');
  if(removeMember) {
    const id=removeMember.dataset.removeMember;
    const name=state.members.find(m=>m.id===id)?.name || 'This person';
    if(!confirm(`Remove ${name}? Their shares will be excluded from balance calculations. Expenses paid by them remain in the history.`)) return;
    state.members=state.members.filter(m=>m.id!==id);
    state.expenses=state.expenses.map(ex=>({...ex,splitIds:ex.splitIds.filter(x=>x!==id)}));
    saveState();render();
  }
  const deleteExpense=e.target.closest('[data-delete-expense]');
  if(deleteExpense) {
    state.expenses=state.expenses.filter(ex=>ex.id!==deleteExpense.dataset.deleteExpense);saveState();render();
  }
});
$('clearExpenses').addEventListener('click',()=>{if(state.expenses.length && confirm('Delete all expenses? This cannot be undone.')){state.expenses=[];saveState();render();}});
$('resetTrip').addEventListener('click',()=>{if(confirm('Reset the entire trip, including all members and expenses? This cannot be undone.')){state={...defaultState,members:[],expenses:[]};saveState();render();}});
render();
// Download Bill Feature
const downloadBtn = document.createElement('button');
downloadBtn.id = 'downloadBill';
downloadBtn.type = 'button';
downloadBtn.className = 'btn primary full';
downloadBtn.textContent = '⬇ Download Bill';
downloadBtn.style.marginTop = '10px';

$('resetTrip').insertAdjacentElement('beforebegin', downloadBtn);

downloadBtn.addEventListener('click', () => {
  const balances = calculateBalances();
  const settlements = getSettlements(balances);

  const rows = [
    ['TripSplit Bill'],
    ['Trip Name', state.tripName],
    ['Date', new Date().toLocaleDateString()],
    ['Total Spent', money(state.expenses.reduce((sum, e) => sum + e.amount, 0))],
    [],
    ['Expense', 'Paid By', 'Amount', 'Split Between']
  ];

  state.expenses.forEach(e => {
    const payer = state.members.find(m => m.id === e.paidBy);
    const names = e.splitIds
      .map(id => state.members.find(m => m.id === id)?.name)
      .filter(Boolean).join(', ');

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
    row.map(value =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"'
    ).join(',')
  ).join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'TripSplit-Bill.csv';
  link.click();
  URL.revokeObjectURL(url);
});
