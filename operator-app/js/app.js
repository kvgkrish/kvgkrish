/* CHC Operator app — views, routing and interactions. */
(function () {
  'use strict';

  const S = Store;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- formatting ----------

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function money(n) { return '₹' + inr.format(Math.round(S.num(n))); }
  function qty(n) { return (Math.round(S.num(n) * 10) / 10).toString(); }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    const today = S.todayStr();
    if (d === today) return 'Today';
    const t = new Date(); t.setDate(t.getDate() + 1);
    if (d === S.todayStr(t)) return 'Tomorrow';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === S.todayStr(y)) return 'Yesterday';
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: dt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  function fmtDateTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function statusBadge(status) {
    const s = S.JOB_STATUSES[status];
    return `<span class="badge ${esc(status)}">${esc(s ? s.label : status)}</span>`;
  }

  function payBadge(job) {
    const ps = S.paymentStatus(job);
    const cls = ps === 'Cleared' ? 'ok' : ps === 'Partial' ? 'warn' : ps === 'Pending' ? 'bad' : '';
    return `<span class="badge ${cls}">${esc(ps)}</span>`;
  }

  function telLink(phone) {
    if (!phone) return '—';
    return `<a href="tel:${esc(phone)}">${esc(phone)}</a>`;
  }

  function waLink(phone, text) {
    const digits = String(phone || '').replace(/\D/g, '');
    const full = digits.length === 10 ? '91' + digits : digits;
    return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
  }

  function mapsLink(job) {
    const q = job.location || [job.customer.village].filter(Boolean).join(', ');
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
  }

  function unitLabel(u, n) {
    if (u === 'hour') return S.num(n) === 1 ? 'hour' : 'hours';
    return S.num(n) === 1 ? 'acre' : 'acres';
  }

  function monthRange() {
    const d = new Date();
    const from = S.todayStr(new Date(d.getFullYear(), d.getMonth(), 1));
    return { from, to: S.todayStr() };
  }

  // ---------- UI primitives ----------

  let toastTimer;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /**
   * Show a modal form. `body` is inner HTML for a <form>; onSubmit receives the
   * FormData and may return false to keep the dialog open.
   */
  function openDialog(body, onSubmit, onOpen) {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<div class="dlg-body"><form method="dialog" novalidate>${body}</form></div>`;
    document.body.appendChild(dlg);
    const form = $('form', dlg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value === 'cancel') { dlg.close(); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const keepOpen = onSubmit && onSubmit(new FormData(form), form) === false;
      if (!keepOpen) dlg.close();
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    if (onOpen) onOpen(form, dlg);
    return dlg;
  }

  function confirmDialog(message, okLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
      let ok = false;
      const dlg = openDialog(`
        <p>${esc(message)}</p>
        <div class="form-actions">
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(okLabel)}</button>
        </div>`, () => { ok = true; });
      dlg.addEventListener('close', () => resolve(ok));
    });
  }

  function optionList(items, selected, { blank } = {}) {
    let out = blank != null ? `<option value="">${esc(blank)}</option>` : '';
    for (const it of items) {
      const [value, label] = Array.isArray(it) ? it : [it, it];
      out += `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
    }
    return out;
  }

  // ---------- session & routing ----------

  function session() { return S.getSession(); }
  function isAdmin() { return session()?.role === 'admin'; }

  function navItems() {
    if (isAdmin()) {
      return [
        ['#/dashboard', '📊', 'Dashboard'],
        ['#/jobs', '📋', 'Jobs'],
        ['#/machines', '🚜', 'Machines'],
        ['#/operators', '👷', 'Operators'],
        ['#/reports', '📈', 'Reports'],
        ['#/settings', '⚙️', 'Settings'],
      ];
    }
    return [
      ['#/my', '📋', 'My jobs'],
      ['#/history', '🕘', 'History'],
      ['#/me', '👤', 'My stats'],
    ];
  }

  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '') || '';
    const parts = hash.split('/').filter(Boolean);
    return { name: parts[0] || '', id: parts[1] || '', sub: parts[2] || '' };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function renderShell() {
    const sess = session();
    const settings = S.getSettings();
    const route = parseRoute();
    const nav = navItems().map(([href, ico, label]) => {
      const key = href.slice(2);
      const active = key === route.name || key === route.name + 's' || (route.name === 'job' && !isAdmin() && key === 'my');
      return `<a href="${href}" class="${active ? 'active' : ''}"><span class="ico" aria-hidden="true">${ico}</span><span>${esc(label)}</span></a>`;
    }).join('');

    document.getElementById('app').innerHTML = `
      <div class="app">
        <header class="topbar">
          <div class="brand">🌾 ${esc(settings.chcName)}</div>
          <span class="who">${esc(S.actorName(sess))}</span>
          <button type="button" id="logout">Switch user</button>
        </header>
        <div class="shell">
          <nav class="sidenav" aria-label="Main">${nav}</nav>
          <main id="main"></main>
        </div>
        <nav class="bottomnav" aria-label="Main">${nav}</nav>
      </div>`;
    $('#logout').addEventListener('click', () => { S.setSession(null); go('#/'); });
  }

  function render() {
    const sess = session();
    if (!sess || (sess.role === 'operator' && !S.getOperator(sess.operatorId))) {
      S.setSession(null);
      renderLogin();
      return;
    }
    const route = parseRoute();
    const adminRoutes = { dashboard: viewDashboard, jobs: viewJobs, job: viewJob, machines: viewMachines, machine: viewMachine, operators: viewOperators, operator: viewOperator, reports: viewReports, settings: viewSettings };
    const opRoutes = { my: viewMyJobs, history: viewMyHistory, me: viewMe, job: viewJob };
    const routes = sess.role === 'admin' ? adminRoutes : opRoutes;
    const fallback = sess.role === 'admin' ? 'dashboard' : 'my';
    if (!routes[route.name]) { location.replace('#/' + fallback); return; }
    renderShell();
    routes[route.name](route);
    window.scrollTo(0, 0);
  }

  // ---------- login ----------

  function renderLogin() {
    const ops = S.listOperators();
    const settings = S.getSettings();
    const noData = !ops.length && !S.listMachines().length && !S.listJobs().length;
    document.getElementById('app').innerHTML = `
      <div class="login">
        <div class="logo" aria-hidden="true">🌾🚜</div>
        <h1>${esc(settings.chcName)}</h1>
        <p class="lead">Customer Hiring Center — Operator job tracker</p>
        <div class="card">
          <h2>Coordinator / Manager</h2>
          <form id="admin-login">
            <label>PIN <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required placeholder="Default PIN is 1234"></label>
            <div class="form-actions"><button class="btn primary block">Sign in as coordinator</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Operator</h2>
          ${ops.length ? `
          <form id="op-login">
            <div class="fields" style="grid-template-columns:1fr">
              <label>Your name <select name="operatorId" required>${optionList(ops.map((o) => [o.id, o.name]), '', { blank: 'Select your name' })}</select></label>
              <label>PIN <input name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="Leave blank if none set"></label>
            </div>
            <div class="form-actions"><button class="btn primary block">Sign in as operator</button></div>
          </form>` : `<p class="muted">No operators yet. The coordinator adds operators under <b>Operators</b>.</p>`}
        </div>
        ${noData ? `<div class="card"><h3>First time here?</h3><p class="muted small">Load sample operators, machines and jobs to explore the app. You can clear them anytime from Settings.</p><button class="btn block" id="load-demo">Load sample data</button></div>` : ''}
      </div>`;

    $('#admin-login').addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = new FormData(e.target).get('pin');
      if (pin !== String(S.getSettings().adminPin)) { toast('Wrong PIN'); return; }
      S.setSession({ role: 'admin' });
      go('#/dashboard');
    });
    const opForm = $('#op-login');
    if (opForm) opForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const op = S.getOperator(fd.get('operatorId'));
      if (!op) { toast('Select your name'); return; }
      if (op.pin && fd.get('pin') !== String(op.pin)) { toast('Wrong PIN'); return; }
      S.setSession({ role: 'operator', operatorId: op.id });
      go('#/my');
    });
    const demoBtn = $('#load-demo');
    if (demoBtn) demoBtn.addEventListener('click', () => {
      S.replaceState(Demo.buildDemo());
      toast('Sample data loaded. Coordinator PIN: 1234, operator PINs: 1111–4444');
      renderLogin();
    });
  }

  // ---------- shared job rendering ----------

  function jobItem(j, { showOperator = true } = {}) {
    const op = S.getOperator(j.operatorId);
    const m = S.getMachine(j.machineId);
    return `
      <a class="item" href="#/job/${esc(j.id)}">
        <div class="row1">
          <span class="title">${esc(j.service)} · ${esc(j.customer.name)}</span>
          ${statusBadge(j.status)}
        </div>
        <div class="meta">
          <span>📅 ${esc(fmtDate(j.date))}${j.time ? ' ' + esc(fmtTime(j.time)) : ''}</span>
          <span>📍 ${esc(j.customer.village || '—')}</span>
          <span>${esc(qty(j.quantity))} ${esc(unitLabel(j.unit, j.quantity))}</span>
          ${showOperator ? `<span>👷 ${op ? esc(op.name) : '<b>Not assigned</b>'}</span>` : ''}
          <span>🚜 ${m ? esc(m.code) : '—'}</span>
          ${j.priority === 'urgent' ? '<span class="badge bad">Urgent</span>' : ''}
          <span class="muted">${esc(j.code)}</span>
        </div>
      </a>`;
  }

  function jobList(jobs, opts) {
    if (!jobs.length) return `<div class="empty">No jobs here.</div>`;
    return `<div class="list">${jobs.map((j) => jobItem(j, opts)).join('')}</div>`;
  }

  // ---------- admin: dashboard ----------

  function viewDashboard() {
    const main = $('#main');
    const today = S.todayStr();
    const todays = S.listJobs({ date: today }).filter((j) => j.status !== 'cancelled');
    const unassigned = S.listJobs({ status: 'pending' });
    const onHold = S.listJobs({ status: 'on_hold' });
    const active = S.listJobs().filter((j) => ['enroute', 'working'].includes(j.status));
    const { from, to } = monthRange();
    const monthJobs = S.listJobs({ from, to });
    const monthDone = monthJobs.filter((j) => j.status === 'completed');
    const revenue = monthDone.reduce((s, j) => s + S.jobBillTotal(j), 0);
    const outstanding = S.listJobs().filter((j) => j.status === 'completed').reduce((s, j) => s + S.jobBalance(j), 0);

    // Alerts
    const alerts = [];
    for (const m of S.listMachines()) {
      const left = S.serviceHoursLeft(m);
      if (left <= 0) alerts.push(['bad', left < 0 ? `🔧 ${m.code} service overdue by ${qty(-left)} h` : `🔧 ${m.code} service due now`, `#/machine/${m.id}`]);
      else if (left <= 20) alerts.push(['warn', `🔧 ${m.code} service due in ${qty(left)} h`, `#/machine/${m.id}`]);
      if (m.insuranceExpiry) {
        const days = Math.round((new Date(m.insuranceExpiry) - new Date(today)) / 86400000);
        if (days < 0) alerts.push(['bad', `🛡️ ${m.code} insurance expired ${fmtDate(m.insuranceExpiry)}`, `#/machine/${m.id}`]);
        else if (days <= 30) alerts.push(['warn', `🛡️ ${m.code} insurance expires in ${days} day${days === 1 ? '' : 's'}`, `#/machine/${m.id}`]);
      }
      if (m.status === 'breakdown') alerts.push(['bad', `⚠️ ${m.code} is broken down`, `#/machine/${m.id}`]);
      if (m.status === 'available') {
        const last = S.machineLastUsed(m.id);
        const upcoming = S.listJobs({ machineId: m.id, status: 'open' }).length;
        const idleDays = last ? Math.round((new Date(today) - new Date(last)) / 86400000) : null;
        if (!upcoming && (idleDays == null || idleDays >= 2)) {
          alerts.push(['info', `💤 ${m.code} idle ${idleDays == null ? '— never used' : idleDays + ' days'} and nothing booked`, `#/machine/${m.id}`]);
        }
      }
    }
    const overdueAssign = S.listJobs({ status: 'pending', to: S.todayStr(new Date(Date.now() + 86400000)) });
    for (const j of overdueAssign) alerts.unshift(['bad', `📋 ${j.code} (${fmtDate(j.date)}) has no operator`, `#/job/${j.id}`]);
    const unpaidOld = S.listJobs({ status: 'completed' }).filter((j) => S.jobBalance(j) > 0 && j.completedAt && (Date.now() - new Date(j.completedAt)) > 3 * 86400000);
    for (const j of unpaidOld) alerts.push(['warn', `💰 ${j.code} ${j.customer.name}: ${money(S.jobBalance(j))} unpaid for 3+ days`, `#/job/${j.id}`]);

    const machines = S.listMachines();
    const util = machines.map((m) => ({ m, st: S.machineStats(m.id, from, to), live: S.machineLiveStatus(m) }));

    main.innerHTML = `
      <div class="page-head">
        <h1>Dashboard</h1>
        <a class="btn primary" href="#/job/new">＋ New booking</a>
      </div>
      <div class="grid stats">
        <div class="stat"><div class="label">Today's jobs</div><div class="value">${todays.length}</div><div class="sub">${todays.filter((j) => j.status === 'completed').length} done · ${active.length} in field now</div></div>
        <div class="stat"><div class="label">Need an operator</div><div class="value" style="color:${unassigned.length ? 'var(--warn)' : 'inherit'}">${unassigned.length}</div><div class="sub">${onHold.length} on hold</div></div>
        <div class="stat"><div class="label">Revenue this month</div><div class="value">${money(revenue)}</div><div class="sub">${monthDone.length} jobs completed</div></div>
        <div class="stat"><div class="label">Outstanding dues</div><div class="value" style="color:${outstanding ? 'var(--danger)' : 'inherit'}">${money(outstanding)}</div><div class="sub">from completed jobs</div></div>
      </div>

      <div class="grid two mt">
        <div>
          <div class="card">
            <h2>Today</h2>
            ${jobList(todays)}
          </div>
          ${unassigned.length ? `<div class="card"><h2>Waiting for assignment</h2>${jobList(unassigned)}</div>` : ''}
        </div>
        <div>
          <div class="card">
            <h2>Alerts</h2>
            ${alerts.length ? alerts.map(([cls, msg, href]) => `<a href="${href}" style="text-decoration:none"><div class="alert ${cls}">${esc(msg)}</div></a>`).join('') : '<p class="muted">All good — nothing needs attention.</p>'}
          </div>
          <div class="card">
            <h2>Fleet this month</h2>
            <p class="muted small" style="margin-top:0">Utilization = hours worked ÷ (working days × ${esc(S.getSettings().workdayHours)} h). Target 70%+.</p>
            <div class="table-wrap"><table>
              <thead><tr><th>Machine</th><th>Status</th><th class="num">Hours</th><th>Utilization</th></tr></thead>
              <tbody>${util.map(({ m, st, live }) => `
                <tr>
                  <td><a href="#/machine/${esc(m.id)}">${esc(m.code)}</a></td>
                  <td>${machineBadge(live)}</td>
                  <td class="num">${qty(st.hours)}</td>
                  <td>${utilBar(st.utilization)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="muted">No machines yet</td></tr>'}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>`;
  }

  function utilBar(pct) {
    const cls = pct < 50 ? 'bad' : pct < 70 ? 'warn' : '';
    return `<div style="display:flex;align-items:center;gap:.5rem"><div class="bar ${cls}" style="flex:1"><span style="width:${Math.min(100, pct).toFixed(0)}%"></span></div><span class="small nowrap">${pct.toFixed(0)}%</span></div>`;
  }

  function machineBadge(live) {
    const cls = { available: 'ok', infield: 'info', booked: 'info', maintenance: 'warn', breakdown: 'bad', retired: '' }[live.key] || '';
    return `<span class="badge ${cls}">${esc(live.label)}</span>`;
  }

  // ---------- admin: jobs list ----------

  const jobFilters = { status: 'open', q: '', operatorId: '', date: '' };

  function viewJobs() {
    const main = $('#main');
    const tabs = [['open', 'Open'], ['pending', 'Unassigned'], ['assigned', 'Assigned'], ['working', 'Working'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']];
    main.innerHTML = `
      <div class="page-head">
        <h1>Jobs</h1>
        <div class="btn-row">
          <button class="btn" id="export-jobs">⬇ CSV</button>
          <a class="btn primary" href="#/job/new">＋ New booking</a>
        </div>
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-status="${k}" class="${jobFilters.status === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="toolbar">
        <input type="search" id="jq" placeholder="Search customer, village, phone, ID" value="${esc(jobFilters.q)}" aria-label="Search jobs">
        <select id="jop" aria-label="Operator">${optionList(S.listOperators({ includeInactive: true }).map((o) => [o.id, o.name]), jobFilters.operatorId, { blank: 'All operators' })}</select>
        <input type="date" id="jdate" value="${esc(jobFilters.date)}" aria-label="Date">
      </div>
      <div id="job-results"></div>`;

    const draw = () => {
      const jobs = S.listJobs(jobFilters);
      if (jobFilters.status === 'completed' || jobFilters.status === 'cancelled' || jobFilters.status === 'all') jobs.reverse();
      $('#job-results').innerHTML = `<p class="muted small">${jobs.length} job${jobs.length === 1 ? '' : 's'}</p>` + jobList(jobs);
    };
    draw();

    $$('.tabs button', main).forEach((b) => b.addEventListener('click', () => {
      jobFilters.status = b.dataset.status;
      $$('.tabs button', main).forEach((x) => x.classList.toggle('active', x === b));
      draw();
    }));
    $('#jq').addEventListener('input', (e) => { jobFilters.q = e.target.value.trim(); draw(); });
    $('#jop').addEventListener('change', (e) => { jobFilters.operatorId = e.target.value; draw(); });
    $('#jdate').addEventListener('change', (e) => { jobFilters.date = e.target.value; draw(); });
    $('#export-jobs').addEventListener('click', () => exportJobsCsv(S.listJobs(jobFilters)));
  }

  // ---------- job detail ----------

  function viewJob(route) {
    if (route.id === 'new') return viewJobForm(null);
    const job = S.getJob(route.id);
    const main = $('#main');
    if (!job) { main.innerHTML = '<div class="empty">Job not found.</div>'; return; }
    const sess = session();
    const admin = isAdmin();
    if (!admin && job.operatorId !== sess.operatorId) { main.innerHTML = '<div class="empty">This job is not assigned to you.</div>'; return; }
    if (route.sub === 'edit' && admin) return viewJobForm(job);

    const op = S.getOperator(job.operatorId);
    const m = S.getMachine(job.machineId);
    const total = S.jobBillTotal(job);
    const paid = S.jobPaid(job);
    const balance = S.jobBalance(job);
    const maps = mapsLink(job);

    // Next-step buttons for the operator workflow
    const actions = [];
    const st = job.status;
    if (st === 'assigned') actions.push(['accepted', '✅ Accept job', 'primary']);
    if (st === 'assigned' || st === 'accepted') actions.push(['enroute', '🚜 Start travel', st === 'accepted' ? 'primary' : '']);
    if (st === 'enroute' || st === 'on_hold') actions.push(['working', st === 'on_hold' ? '▶ Resume work' : '📍 Reached — start work', 'primary']);
    if (st === 'working') actions.push(['complete', '🏁 Complete job', 'primary']);
    if (['enroute', 'working'].includes(st)) actions.push(['breakdown', '⚠️ Report breakdown', 'warn']);
    if (st === 'assigned' && !admin) actions.push(['reject', '✖ Can\'t do this job', 'ghost']);
    if (!['cancelled'].includes(st) && balance > 0 && st !== 'pending') actions.push(['payment', '💰 Record payment', '']);
    actions.push(['note', '📝 Add note', 'ghost']);

    const operatorMsg = `Job ${job.code}\n${job.service} — ${qty(job.quantity)} ${unitLabel(job.unit, job.quantity)}\nDate: ${fmtDate(job.date)} ${fmtTime(job.time)}\nCustomer: ${job.customer.name} (${job.customer.phone || ''})\nVillage: ${job.customer.village || ''}${job.location ? '\nLocation: ' + job.location : ''}\nMachine: ${m ? m.code : '-'}${job.notes ? '\nNotes: ' + job.notes : ''}`;
    const customerMsg = `Namaste ${job.customer.name}, your ${job.service} booking ${job.code} is confirmed for ${fmtDate(job.date)} ${fmtTime(job.time)}.${op ? ` Operator: ${op.name} (${op.phone}).` : ''} Amount: ${money(total)}, balance ${money(balance)}. — ${S.getSettings().chcName}`;

    main.innerHTML = `
      <div class="page-head">
        <div>
          <a href="${admin ? '#/jobs' : '#/my'}" class="small">← Back</a>
          <h1>${esc(job.service)} · ${esc(job.customer.name)}</h1>
          <div class="btn-row" style="align-items:center">${statusBadge(job.status)} ${payBadge(job)} ${job.priority === 'urgent' ? '<span class="badge bad">Urgent</span>' : ''} <span class="muted small">${esc(job.code)}</span></div>
        </div>
        ${admin ? `<div class="btn-row">
          <a class="btn" href="#/job/${esc(job.id)}/edit">✏️ Edit / assign</a>
          ${!['completed', 'cancelled'].includes(st) ? '<button class="btn ghost" data-act="cancel">Cancel job</button>' : ''}
          ${st === 'cancelled' ? '<button class="btn ghost" data-act="reopen">Reopen</button><button class="btn danger" data-act="delete">Delete</button>' : ''}
        </div>` : ''}
      </div>

      ${st !== 'completed' && st !== 'cancelled' ? `<div class="card"><div class="btn-row">${actions.map(([k, l, c]) => `<button class="btn ${c}" data-act="${k}">${l}</button>`).join('')}</div></div>` : `<div class="card"><div class="btn-row">${actions.filter(([k]) => ['payment', 'note'].includes(k)).map(([k, l, c]) => `<button class="btn ${c}" data-act="${k}">${l}</button>`).join('')}</div></div>`}

      <div class="grid two">
        <div>
          <div class="card">
            <h2>Job</h2>
            <dl class="kv">
              <dt>Date</dt><dd>${esc(fmtDate(job.date))} ${esc(fmtTime(job.time))}</dd>
              <dt>Service</dt><dd>${esc(job.service)}${job.crop ? ' · ' + esc(job.crop) : ''}</dd>
              <dt>Booked</dt><dd>${esc(qty(job.quantity))} ${esc(unitLabel(job.unit, job.quantity))} × ${money(job.rate)}</dd>
              <dt>Operator</dt><dd>${op ? `${esc(op.name)} · ${telLink(op.phone)}` : '<b style="color:var(--warn)">Not assigned</b>'}</dd>
              <dt>Machine</dt><dd>${m ? `${esc(m.code)} · ${esc(m.model || m.type)}` : '—'}</dd>
              ${job.notes ? `<dt>Notes</dt><dd>${esc(job.notes)}</dd>` : ''}
            </dl>
          </div>
          <div class="card">
            <h2>Customer</h2>
            <dl class="kv">
              <dt>Name</dt><dd>${esc(job.customer.name)}</dd>
              <dt>Phone</dt><dd>${telLink(job.customer.phone)}</dd>
              <dt>Village</dt><dd>${esc(job.customer.village || '—')}</dd>
              ${job.location ? `<dt>Location</dt><dd>${esc(job.location)}</dd>` : ''}
            </dl>
            <div class="btn-row mt">
              ${job.customer.phone ? `<a class="btn small" href="tel:${esc(job.customer.phone)}">📞 Call</a>` : ''}
              ${maps ? `<a class="btn small" href="${esc(maps)}" target="_blank" rel="noopener">🗺️ Directions</a>` : ''}
              ${admin && job.customer.phone ? `<a class="btn small" href="${esc(waLink(job.customer.phone, customerMsg))}" target="_blank" rel="noopener">💬 Confirm to customer</a>` : ''}
              ${admin && op && op.phone ? `<a class="btn small" href="${esc(waLink(op.phone, operatorMsg))}" target="_blank" rel="noopener">💬 Send to operator</a>` : ''}
            </div>
          </div>
          ${job.actual ? `
          <div class="card">
            <h2>Work done</h2>
            <dl class="kv">
              <dt>Covered</dt><dd>${esc(qty(job.actual.quantity))} ${esc(unitLabel(job.unit, job.actual.quantity))}</dd>
              <dt>Hours</dt><dd>${esc(qty(job.actual.hours))} h</dd>
              <dt>Fuel</dt><dd>${esc(qty(job.actual.fuel))} L</dd>
              ${job.actual.meterEnd != null ? `<dt>Hour meter</dt><dd>${esc(job.actual.meterEnd)}</dd>` : ''}
              <dt>Customer rating</dt><dd>${job.rating ? '★'.repeat(job.rating) + '☆'.repeat(5 - job.rating) : '—'}</dd>
              ${job.actual.issues ? `<dt>Issues</dt><dd>${esc(job.actual.issues)}</dd>` : ''}
              <dt>Completed</dt><dd>${esc(fmtDateTime(job.completedAt))}</dd>
            </dl>
          </div>` : ''}
        </div>
        <div>
          <div class="card">
            <h2>Payment</h2>
            <dl class="kv">
              <dt>${st === 'completed' ? 'Bill' : 'Estimate'}</dt><dd>${money(total)}${S.num(job.transport) ? ` <span class="muted small">(incl. ${money(job.transport)} transport)</span>` : ''}${S.num(job.discount) ? ` <span class="muted small">(−${money(job.discount)} discount)</span>` : ''}</dd>
              <dt>Paid</dt><dd>${money(paid)}</dd>
              <dt>Balance</dt><dd><b style="color:${balance ? 'var(--danger)' : 'var(--primary)'}">${money(balance)}</b></dd>
            </dl>
            ${(job.payments || []).length ? `<div class="table-wrap mt"><table><thead><tr><th>When</th><th>Mode</th><th>By</th><th class="num">Amount</th></tr></thead><tbody>
              ${job.payments.map((p) => `<tr><td>${esc(fmtDateTime(p.at))}</td><td>${esc(p.mode)}${p.note ? ` <span class="muted small">${esc(p.note)}</span>` : ''}</td><td>${esc(p.by)}</td><td class="num">${money(p.amount)}</td></tr>`).join('')}
            </tbody></table></div>` : ''}
          </div>
          <div class="card">
            <h2>Activity</h2>
            <ul class="timeline">
              ${(job.history || []).slice().reverse().map((h) => `<li><div><b>${esc(S.JOB_STATUSES[h.status]?.label || h.status)}</b>${h.note ? ' — ' + esc(h.note) : ''}</div><div class="when">${esc(fmtDateTime(h.at))} · ${esc(h.by)}</div></li>`).join('')}
            </ul>
          </div>
        </div>
      </div>`;

    $$('[data-act]', main).forEach((b) => b.addEventListener('click', () => jobAction(job, b.dataset.act)));
  }

  async function jobAction(job, act) {
    const sess = session();
    const rerender = () => render();
    switch (act) {
      case 'accepted':
        S.setJobStatus(job.id, 'accepted', sess); toast('Job accepted'); rerender(); break;
      case 'enroute':
        S.setJobStatus(job.id, 'enroute', sess); toast('Marked on the way'); rerender(); break;
      case 'working':
        S.setJobStatus(job.id, 'working', sess, job.status === 'on_hold' ? 'Work resumed' : 'Reached field'); toast('Work started'); rerender(); break;
      case 'complete':
        completeDialog(job); break;
      case 'breakdown':
        openDialog(`
          <h2>Report breakdown</h2>
          <p class="muted small">The job goes on hold and the machine is marked broken down so the coordinator can send a replacement.</p>
          <label>What happened? <textarea name="note" required placeholder="e.g. Rotavator blade broken, hydraulic leak"></textarea></label>
          <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn warn">Report</button></div>`,
        (fd) => { S.reportBreakdown(job.id, fd.get('note'), sess); toast('Breakdown reported'); rerender(); });
        break;
      case 'reject':
        openDialog(`
          <h2>Can't do this job?</h2>
          <p class="muted small">The job goes back to the coordinator for re-assignment.</p>
          <label>Reason <textarea name="note" required></textarea></label>
          <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn danger">Send back</button></div>`,
        (fd) => {
          S.saveJob({ id: job.id, operatorId: '' }, sess);
          S.addNote(job.id, `Returned by operator: ${fd.get('note')}`, sess);
          toast('Sent back to coordinator');
          go('#/my');
        });
        break;
      case 'payment':
        openDialog(`
          <h2>Record payment</h2>
          <p class="muted small">Balance due: <b>${money(S.jobBalance(job))}</b></p>
          <div class="fields">
            <label>Amount (₹) <input name="amount" type="number" min="1" step="1" required value="${S.jobBalance(job)}"></label>
            <label>Mode <select name="mode">${optionList(S.PAYMENT_MODES, 'Cash')}</select></label>
            <label class="full">Note <input name="note" placeholder="Optional — UPI ref, receipt no."></label>
          </div>
          <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Save</button></div>`,
        (fd) => { S.addPayment(job.id, { amount: fd.get('amount'), mode: fd.get('mode'), note: fd.get('note') }, sess); toast('Payment recorded'); rerender(); });
        break;
      case 'note':
        openDialog(`
          <h2>Add note</h2>
          <label>Note <textarea name="note" required></textarea></label>
          <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Save</button></div>`,
        (fd) => { S.addNote(job.id, fd.get('note'), sess); rerender(); });
        break;
      case 'cancel':
        openDialog(`
          <h2>Cancel job ${esc(job.code)}</h2>
          <label>Reason <textarea name="note" required placeholder="Customer cancelled, rain, no machine…"></textarea></label>
          ${S.jobPaid(job) ? `<p class="alert warn">${money(S.jobPaid(job))} advance was collected — settle the refund per cancellation policy.</p>` : ''}
          <div class="form-actions"><button class="btn" value="cancel">Back</button><button class="btn danger">Cancel job</button></div>`,
        (fd) => { S.setJobStatus(job.id, 'cancelled', sess, fd.get('note')); toast('Job cancelled'); rerender(); });
        break;
      case 'reopen':
        S.setJobStatus(job.id, job.operatorId ? 'assigned' : 'pending', sess, 'Reopened'); rerender(); break;
      case 'delete':
        if (await confirmDialog(`Delete ${job.code} permanently?`, 'Delete', true)) { S.deleteJob(job.id); toast('Deleted'); go('#/jobs'); }
        break;
    }
  }

  function completeDialog(job) {
    const sess = session();
    const m = S.getMachine(job.machineId);
    const estHours = job.startedWorkAt ? Math.max(0.5, Math.round(((Date.now() - new Date(job.startedWorkAt)) / 3600000) * 2) / 2) : '';
    openDialog(`
      <h2>Complete job</h2>
      <div class="fields">
        <label>${job.unit === 'hour' ? 'Hours billed' : 'Acres covered'} <input name="quantity" type="number" min="0" step="0.1" required value="${esc(job.quantity)}"></label>
        <label>Engine hours worked <input name="hours" type="number" min="0" step="0.1" required value="${esc(job.unit === 'hour' ? job.quantity : estHours)}"></label>
        <label>Diesel used (litres) <input name="fuel" type="number" min="0" step="0.1" placeholder="0"></label>
        <label>Hour meter reading at end <input name="meterEnd" type="number" min="0" step="0.1" placeholder="${m ? 'Last: ' + esc(m.hourMeter) : ''}"><span class="hint">Optional — keeps service reminders accurate</span></label>
        <label class="full">Issues / remarks <textarea name="issues" placeholder="Anything the office should know"></textarea></label>
        <label>Payment collected now (₹) <input name="amount" type="number" min="0" step="1" value="0" id="pay-amt"><span class="hint" id="bill-hint"></span></label>
        <label>Mode <select name="mode">${optionList(S.PAYMENT_MODES, 'Cash')}</select></label>
        <label class="full">Customer rating
          <select name="rating">${optionList([['', 'Not asked'], ['5', '★★★★★ Excellent'], ['4', '★★★★ Good'], ['3', '★★★ Okay'], ['2', '★★ Poor'], ['1', '★ Very poor']], '')}</select>
        </label>
      </div>
      <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Mark completed</button></div>`,
    (fd) => {
      S.completeJob(job.id, { quantity: fd.get('quantity'), hours: fd.get('hours'), fuel: fd.get('fuel'), meterEnd: fd.get('meterEnd'), issues: fd.get('issues') },
        { amount: fd.get('amount'), mode: fd.get('mode') }, fd.get('rating'), sess);
      toast('Job completed 🎉');
      render();
    },
    (form) => {
      const qtyInput = form.elements.quantity;
      const update = () => {
        const bill = Math.round(S.num(qtyInput.value) * S.num(job.rate) + S.num(job.transport) - S.num(job.discount));
        const due = Math.max(0, bill - S.jobPaid(job));
        $('#bill-hint', form).textContent = `Bill ${money(bill)} · already paid ${money(S.jobPaid(job))} · due ${money(due)}`;
        form.elements.amount.value = due;
      };
      qtyInput.addEventListener('input', update);
      update();
    });
  }

  // ---------- job form ----------

  function viewJobForm(job) {
    const main = $('#main');
    const isNew = !job;
    const settings = S.getSettings();
    const j = job || { customer: {}, date: S.todayStr(), time: '07:00', priority: 'normal', service: settings.services[0]?.name, transport: 0, discount: 0 };
    const svc = S.getService(j.service) || settings.services[0] || { unit: 'acre', rate: 0 };
    const operators = S.listOperators();
    const machines = S.listMachines();
    // Customers seen before, for quick fill
    const knownCustomers = {};
    S.listJobs().forEach((x) => { if (x.customer?.name) knownCustomers[x.customer.name] = x.customer; });

    main.innerHTML = `
      <div class="page-head">
        <div><a href="${isNew ? '#/jobs' : '#/job/' + esc(j.id)}" class="small">← Back</a><h1>${isNew ? 'New booking' : 'Edit ' + esc(j.code)}</h1></div>
      </div>
      <form id="job-form" class="card" novalidate>
        <h2>Customer</h2>
        <div class="fields">
          <label>Name <input name="cname" required list="cust-list" value="${esc(j.customer.name)}" autocomplete="off">
            <datalist id="cust-list">${Object.keys(knownCustomers).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          </label>
          <label>Phone <input name="cphone" type="tel" inputmode="tel" value="${esc(j.customer.phone)}"></label>
          <label>Village <input name="village" value="${esc(j.customer.village)}"></label>
          <label>Field location / landmark <input name="location" value="${esc(j.location)}" placeholder="Survey no., landmark or map link"></label>
        </div>

        <h2 class="mt">Work</h2>
        <div class="fields">
          <label>Service <select name="service" required>${optionList(settings.services.map((s) => s.name), j.service)}</select></label>
          <label>Crop <input name="crop" value="${esc(j.crop)}" placeholder="Paddy, cotton, maize…"></label>
          <label><span id="qty-label">${svc.unit === 'hour' ? 'Hours' : 'Acres'}</span> <input name="quantity" type="number" min="0.1" step="0.1" required value="${esc(j.quantity)}"></label>
          <label>Rate (₹ per <span id="rate-unit">${esc(svc.unit)}</span>) <input name="rate" type="number" min="0" step="1" required value="${esc(j.rate ?? svc.rate)}"></label>
          <label>Transport charge (₹) <input name="transport" type="number" min="0" step="1" value="${esc(j.transport || 0)}"></label>
          <label>Discount (₹) <input name="discount" type="number" min="0" step="1" value="${esc(j.discount || 0)}"></label>
          <label>Date <input name="date" type="date" required value="${esc(j.date)}"></label>
          <label>Start time <input name="time" type="time" value="${esc(j.time)}"></label>
          <label>Priority <select name="priority">${optionList([['normal', 'Normal'], ['urgent', 'Urgent']], j.priority)}</select></label>
          ${isNew ? `
          <label>Advance received (₹) <input name="advance" type="number" min="0" step="1" value="0"></label>
          <label>Advance mode <select name="advanceMode">${optionList(S.PAYMENT_MODES, 'UPI')}</select></label>` : ''}
          <div class="full"><b>Estimated total: <span id="est-total"></span></b></div>
        </div>

        <h2 class="mt">Assignment</h2>
        <div class="fields">
          <label>Operator <select name="operatorId">${optionList(operators.map((o) => [o.id, o.name]), j.operatorId, { blank: '— Assign later —' })}</select><span class="hint" id="op-hint"></span></label>
          <label>Machine <select name="machineId">${optionList(machines.map((m) => [m.id, `${m.code} · ${m.type}${m.status !== 'available' ? ' (' + S.MACHINE_STATUSES[m.status] + ')' : ''}`]), j.machineId, { blank: '— Select machine —' })}</select></label>
          <div class="full" id="conflicts"></div>
          <label class="full">Instructions for operator <textarea name="notes" placeholder="Access road, gate, special instructions">${esc(j.notes)}</textarea></label>
        </div>

        <div class="form-actions">
          <a class="btn" href="${isNew ? '#/jobs' : '#/job/' + esc(j.id)}">Cancel</a>
          <button class="btn primary">${isNew ? 'Create booking' : 'Save changes'}</button>
        </div>
      </form>`;

    const form = $('#job-form');
    const el = form.elements;

    function refresh() {
      const s = S.getService(el.service.value);
      if (s) {
        $('#qty-label').textContent = s.unit === 'hour' ? 'Hours' : 'Acres';
        $('#rate-unit').textContent = s.unit;
      }
      const total = Math.round(S.num(el.quantity.value) * S.num(el.rate.value) + S.num(el.transport.value) - S.num(el.discount.value));
      $('#est-total').textContent = money(total);

      // Skill hint
      const op = S.getOperator(el.operatorId.value);
      $('#op-hint').textContent = op && op.skills?.length && !op.skills.includes(el.service.value) ? `⚠ ${op.name} is not marked as trained for ${el.service.value}` : '';

      // Double-booking check
      const conflicts = S.findConflicts({ id: j.id, date: el.date.value, operatorId: el.operatorId.value, machineId: el.machineId.value });
      const mc = S.getMachine(el.machineId.value);
      const warn = [];
      if (mc && mc.status !== 'available') warn.push(`${mc.code} is currently: ${S.MACHINE_STATUSES[mc.status]}`);
      conflicts.forEach((c) => {
        const what = [c.operatorId === el.operatorId.value ? S.getOperator(c.operatorId)?.name : null, c.machineId === el.machineId.value ? S.getMachine(c.machineId)?.code : null].filter(Boolean).join(' & ');
        warn.push(`${what} already booked on ${fmtDate(c.date)} ${fmtTime(c.time)} — ${c.code} (${c.customer.name}, ${c.customer.village || ''})`);
      });
      $('#conflicts').innerHTML = warn.map((w) => `<div class="alert warn">⚠ ${esc(w)}</div>`).join('');
    }

    el.service.addEventListener('change', () => {
      const s = S.getService(el.service.value);
      if (s) el.rate.value = s.rate;
      // Suggest a machine whose type matches the service
      refresh();
    });
    el.cname.addEventListener('change', () => {
      const c = knownCustomers[el.cname.value];
      if (c) {
        if (!el.cphone.value) el.cphone.value = c.phone || '';
        if (!el.village.value) el.village.value = c.village || '';
      }
    });
    ['quantity', 'rate', 'transport', 'discount', 'date', 'operatorId', 'machineId'].forEach((n) => el[n].addEventListener('input', refresh));
    refresh();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const s = S.getService(el.service.value);
      const data = {
        customer: { name: el.cname.value.trim(), phone: el.cphone.value.trim(), village: el.village.value.trim() },
        location: el.location.value.trim(),
        service: el.service.value,
        unit: s ? s.unit : 'acre',
        crop: el.crop.value.trim(),
        quantity: S.num(el.quantity.value),
        rate: S.num(el.rate.value),
        transport: S.num(el.transport.value),
        discount: S.num(el.discount.value),
        date: el.date.value,
        time: el.time.value,
        priority: el.priority.value,
        operatorId: el.operatorId.value,
        machineId: el.machineId.value,
        notes: el.notes.value.trim(),
      };
      if (isNew) { data.advance = el.advance.value; data.advanceMode = el.advanceMode.value; }
      else data.id = j.id;
      const saved = S.saveJob(data, session());
      toast(isNew ? `Booking ${saved.code} created` : 'Saved');
      go('#/job/' + saved.id);
    });
  }

  // ---------- admin: machines ----------

  function viewMachines() {
    const main = $('#main');
    const machines = S.listMachines({ includeRetired: true });
    const { from, to } = monthRange();
    main.innerHTML = `
      <div class="page-head"><h1>Machines</h1><button class="btn primary" id="add-machine">＋ Add machine</button></div>
      ${machines.length ? `<div class="list">${machines.map((m) => {
        const live = S.machineLiveStatus(m);
        const left = S.serviceHoursLeft(m);
        const st = S.machineStats(m.id, from, to);
        const op = live.job ? S.getOperator(live.job.operatorId) : null;
        return `
        <a class="item" href="#/machine/${esc(m.id)}">
          <div class="row1"><span class="title">${esc(m.code)} · ${esc(m.type)}</span>${machineBadge(live)}</div>
          <div class="meta">
            <span>${esc(m.model || '')}</span>
            <span>⏱ ${esc(qty(m.hourMeter))} h</span>
            <span>${left === Infinity ? '' : left <= 0 ? `<b style="color:var(--danger)">Service overdue</b>` : `Service in ${qty(left)} h`}</span>
            <span>This month: ${qty(st.hours)} h · ${st.utilization.toFixed(0)}%</span>
            ${live.job ? `<span>📋 ${esc(live.job.code)}${op ? ' · ' + esc(op.name) : ''}</span>` : ''}
          </div>
        </a>`;
      }).join('')}</div>` : '<div class="empty">No machines yet. Add your tractors, implements and drones.</div>'}`;
    $('#add-machine').addEventListener('click', () => machineDialog(null));
  }

  function machineDialog(m) {
    const x = m || { status: 'available', hourMeter: 0, serviceIntervalHrs: 250, lastServiceHrs: 0 };
    const types = ['Tractor', 'Rotavator', 'Cultivator', 'Plough', 'Laser land leveler', 'Seed drill', 'Happy Seeder', 'Sprayer', 'Mulcher', 'Drone', 'Baler', 'Harvester', 'Other'];
    openDialog(`
      <h2>${m ? 'Edit machine' : 'Add machine'}</h2>
      <div class="fields">
        <label>Machine ID <input name="code" required value="${esc(x.code)}" placeholder="TRACT-001"></label>
        <label>Type <select name="type">${optionList(types, x.type || 'Tractor')}</select></label>
        <label>Make / model <input name="model" value="${esc(x.model)}"></label>
        <label>Registration / UIN <input name="regNo" value="${esc(x.regNo)}"></label>
        <label>Hour meter now <input name="hourMeter" type="number" min="0" step="0.1" value="${esc(x.hourMeter)}"></label>
        <label>Service every (hours) <input name="serviceIntervalHrs" type="number" min="0" step="1" value="${esc(x.serviceIntervalHrs)}"><span class="hint">Tractor 250 · implements 50 · drone 100</span></label>
        <label>Hour meter at last service <input name="lastServiceHrs" type="number" min="0" step="0.1" value="${esc(x.lastServiceHrs)}"></label>
        <label>Insurance expiry <input name="insuranceExpiry" type="date" value="${esc(x.insuranceExpiry)}"></label>
        <label>Status <select name="status">${optionList(Object.entries(S.MACHINE_STATUSES), x.status)}</select></label>
        <label>Primary operator <select name="primaryOperatorId">${optionList(S.listOperators().map((o) => [o.id, o.name]), x.primaryOperatorId, { blank: '—' })}</select></label>
        <label class="full">Notes <textarea name="notes">${esc(x.notes)}</textarea></label>
      </div>
      <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Save</button></div>`,
    (fd) => {
      const code = fd.get('code').trim().toUpperCase();
      if (S.listMachines({ includeRetired: true }).some((o) => o.code === code && o.id !== x.id)) { toast('That machine ID already exists'); return false; }
      S.saveMachine({
        id: x.id, code, type: fd.get('type'), model: fd.get('model').trim(), regNo: fd.get('regNo').trim(),
        hourMeter: S.num(fd.get('hourMeter')), serviceIntervalHrs: S.num(fd.get('serviceIntervalHrs')), lastServiceHrs: S.num(fd.get('lastServiceHrs')),
        insuranceExpiry: fd.get('insuranceExpiry'), status: fd.get('status'), primaryOperatorId: fd.get('primaryOperatorId'), notes: fd.get('notes').trim(),
      });
      toast('Machine saved');
      render();
    });
  }

  function viewMachine(route) {
    const m = S.getMachine(route.id);
    const main = $('#main');
    if (!m) { main.innerHTML = '<div class="empty">Machine not found.</div>'; return; }
    const live = S.machineLiveStatus(m);
    const { from, to } = monthRange();
    const st = S.machineStats(m.id, from, to);
    const left = S.serviceHoursLeft(m);
    const upcoming = S.listJobs({ machineId: m.id, status: 'open' });
    const recent = S.listJobs({ machineId: m.id, status: 'completed' }).reverse().slice(0, 10);
    const primary = S.getOperator(m.primaryOperatorId);
    main.innerHTML = `
      <div class="page-head">
        <div><a href="#/machines" class="small">← Machines</a><h1>${esc(m.code)} · ${esc(m.type)}</h1>${machineBadge(live)}</div>
        <div class="btn-row">
          <button class="btn" id="log-service">🔧 Log service</button>
          <button class="btn" id="edit">✏️ Edit</button>
          <button class="btn ghost" id="del">Remove</button>
        </div>
      </div>
      <div class="grid stats">
        <div class="stat"><div class="label">Hour meter</div><div class="value">${qty(m.hourMeter)}</div><div class="sub">${left === Infinity ? 'No service interval' : left <= 0 ? 'Service overdue by ' + qty(-left) + ' h' : 'Next service in ' + qty(left) + ' h'}</div></div>
        <div class="stat"><div class="label">Utilization (month)</div><div class="value">${st.utilization.toFixed(0)}%</div><div class="sub">${qty(st.hours)} h worked</div></div>
        <div class="stat"><div class="label">Revenue (month)</div><div class="value">${money(st.revenue)}</div><div class="sub">${st.jobs} jobs</div></div>
        <div class="stat"><div class="label">Diesel (month)</div><div class="value">${qty(st.fuel)} L</div><div class="sub">${st.hours ? qty(st.fuel / st.hours) + ' L/h' : '—'}</div></div>
      </div>
      <div class="grid two mt">
        <div>
          <div class="card"><h2>Details</h2><dl class="kv">
            <dt>Model</dt><dd>${esc(m.model || '—')}</dd>
            <dt>Reg / UIN</dt><dd>${esc(m.regNo || '—')}</dd>
            <dt>Insurance</dt><dd>${m.insuranceExpiry ? esc(fmtDate(m.insuranceExpiry)) : '—'}</dd>
            <dt>Primary operator</dt><dd>${primary ? esc(primary.name) : '—'}</dd>
            <dt>Last service</dt><dd>${m.lastServiceDate ? esc(fmtDate(m.lastServiceDate)) + ' at ' : ''}${esc(qty(m.lastServiceHrs))} h</dd>
            ${m.notes ? `<dt>Notes</dt><dd>${esc(m.notes)}</dd>` : ''}
          </dl></div>
          <div class="card"><h2>Upcoming jobs</h2>${jobList(upcoming)}</div>
        </div>
        <div>
          <div class="card"><h2>Service & breakdown log</h2>
            ${(m.serviceLog || []).length ? `<ul class="timeline">${m.serviceLog.map((l) => `<li><div>${esc(l.note)}</div><div class="when">${esc(fmtDateTime(l.at))} · ${esc(qty(l.hours))} h · ${esc(l.by)}</div></li>`).join('')}</ul>` : '<p class="muted">No entries yet.</p>'}
          </div>
          <div class="card"><h2>Recent completed jobs</h2>${jobList(recent)}</div>
        </div>
      </div>`;
    $('#edit').addEventListener('click', () => machineDialog(m));
    $('#log-service').addEventListener('click', () => openDialog(`
      <h2>Log service — ${esc(m.code)}</h2>
      <div class="fields">
        <label>Hour meter now <input name="hours" type="number" min="0" step="0.1" value="${esc(m.hourMeter)}"></label>
        <label class="full">Work done <textarea name="note" required placeholder="Oil change, filter, greasing, blade replaced…"></textarea></label>
      </div>
      <p class="muted small">Resets the service counter and marks the machine available.</p>
      <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Save</button></div>`,
    (fd) => {
      S.saveMachine({ id: m.id, hourMeter: Math.max(S.num(m.hourMeter), S.num(fd.get('hours'))) });
      S.logService(m.id, fd.get('note'), session());
      toast('Service logged'); render();
    }));
    $('#del').addEventListener('click', async () => {
      if (!(await confirmDialog(`Remove ${m.code}? Machines with job history are marked retired instead of deleted.`, 'Remove', true))) return;
      const r = S.deleteMachine(m.id);
      toast(r === 'retired' ? 'Marked as retired' : 'Machine deleted');
      go('#/machines');
    });
  }

  // ---------- admin: operators ----------

  function viewOperators() {
    const main = $('#main');
    const ops = S.listOperators({ includeInactive: true });
    const { from, to } = monthRange();
    const today = S.todayStr();
    main.innerHTML = `
      <div class="page-head"><h1>Operators</h1><button class="btn primary" id="add-op">＋ Add operator</button></div>
      ${ops.length ? `<div class="list">${ops.map((o) => {
        const st = S.operatorStats(o.id, from, to);
        const todayJobs = S.listJobs({ operatorId: o.id, date: today }).filter((j) => j.status !== 'cancelled');
        const active = S.listJobs({ operatorId: o.id }).find((j) => ['enroute', 'working'].includes(j.status));
        return `
        <a class="item" href="#/operator/${esc(o.id)}">
          <div class="row1"><span class="title">${esc(o.name)}</span>
            ${o.active === false ? '<span class="badge">Inactive</span>' : active ? statusBadge(active.status) : todayJobs.length ? `<span class="badge info">${todayJobs.length} job${todayJobs.length > 1 ? 's' : ''} today</span>` : '<span class="badge ok">Free today</span>'}
          </div>
          <div class="meta">
            <span>📞 ${esc(o.phone || '—')}</span>
            <span>This month: ${st.completed} done · ${qty(st.hours)} h · ${qty(st.quantity)} units</span>
            <span>${st.rating ? '★ ' + st.rating.toFixed(1) : 'No ratings'}</span>
            ${o.skills?.length ? `<span class="muted">${esc(o.skills.join(', '))}</span>` : ''}
          </div>
        </a>`;
      }).join('')}</div>` : '<div class="empty">No operators yet. Add your tractor drivers and drone pilots.</div>'}`;
    $('#add-op').addEventListener('click', () => operatorDialog(null));
  }

  function operatorDialog(o) {
    const x = o || { active: true, skills: [] };
    const services = S.getSettings().services.map((s) => s.name);
    openDialog(`
      <h2>${o ? 'Edit operator' : 'Add operator'}</h2>
      <div class="fields">
        <label>Name <input name="name" required value="${esc(x.name)}"></label>
        <label>Phone <input name="phone" type="tel" inputmode="tel" value="${esc(x.phone)}"></label>
        <label>Licence / certificate no. <input name="license" value="${esc(x.license)}" placeholder="Driving licence or DGCA RPC"></label>
        <label>Login PIN <input name="pin" inputmode="numeric" value="${esc(x.pin)}" placeholder="Optional"><span class="hint">Operator uses this to sign in on their phone</span></label>
        <label>Daily wage / salary note <input name="pay" value="${esc(x.pay)}" placeholder="e.g. ₹700/day + ₹50/acre"></label>
        <label>Status <select name="active">${optionList([['1', 'Active'], ['0', 'Inactive']], x.active === false ? '0' : '1')}</select></label>
        <div class="full"><span class="small muted" style="font-weight:600">Trained for</span>
          <div class="checks">${services.map((s) => `<label><input type="checkbox" name="skills" value="${esc(s)}" ${x.skills?.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div>
        </div>
      </div>
      <div class="form-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary">Save</button></div>`,
    (fd) => {
      S.saveOperator({ id: x.id, name: fd.get('name').trim(), phone: fd.get('phone').trim(), license: fd.get('license').trim(), pin: fd.get('pin').trim(), pay: fd.get('pay').trim(), active: fd.get('active') === '1', skills: fd.getAll('skills') });
      toast('Operator saved');
      render();
    });
  }

  function viewOperator(route) {
    const o = S.getOperator(route.id);
    const main = $('#main');
    if (!o) { main.innerHTML = '<div class="empty">Operator not found.</div>'; return; }
    const { from, to } = monthRange();
    const st = S.operatorStats(o.id, from, to);
    const upcoming = S.listJobs({ operatorId: o.id, status: 'open' });
    const recent = S.listJobs({ operatorId: o.id, status: 'completed' }).reverse().slice(0, 15);
    main.innerHTML = `
      <div class="page-head">
        <div><a href="#/operators" class="small">← Operators</a><h1>${esc(o.name)}</h1>${o.active === false ? '<span class="badge">Inactive</span>' : ''}</div>
        <div class="btn-row">
          ${o.phone ? `<a class="btn" href="tel:${esc(o.phone)}">📞 Call</a>` : ''}
          <button class="btn" id="edit">✏️ Edit</button>
          <button class="btn ghost" id="del">Remove</button>
        </div>
      </div>
      ${operatorStatsBlock(st)}
      <div class="grid two mt">
        <div>
          <div class="card"><h2>Details</h2><dl class="kv">
            <dt>Phone</dt><dd>${telLink(o.phone)}</dd>
            <dt>Licence</dt><dd>${esc(o.license || '—')}</dd>
            <dt>Pay</dt><dd>${esc(o.pay || '—')}</dd>
            <dt>Trained for</dt><dd>${esc(o.skills?.join(', ') || '—')}</dd>
          </dl></div>
          <div class="card"><h2>Assigned jobs</h2>${jobList(upcoming, { showOperator: false })}</div>
        </div>
        <div class="card"><h2>Recent completed</h2>${jobList(recent, { showOperator: false })}</div>
      </div>`;
    $('#edit').addEventListener('click', () => operatorDialog(o));
    $('#del').addEventListener('click', async () => {
      if (!(await confirmDialog(`Remove ${o.name}? Operators with job history are deactivated instead of deleted.`, 'Remove', true))) return;
      const r = S.deleteOperator(o.id);
      toast(r === 'deactivated' ? 'Operator deactivated' : 'Operator deleted');
      go('#/operators');
    });
  }

  function operatorStatsBlock(st) {
    return `
      <div class="grid stats">
        <div class="stat"><div class="label">Jobs done (month)</div><div class="value">${st.completed}</div><div class="sub">${st.open} open</div></div>
        <div class="stat"><div class="label">Hours worked</div><div class="value">${qty(st.hours)}</div><div class="sub">${qty(st.quantity)} acres/hours billed</div></div>
        <div class="stat"><div class="label">Cash collected</div><div class="value">${money(st.collected)}</div><div class="sub">to hand over</div></div>
        <div class="stat"><div class="label">Customer rating</div><div class="value">${st.rating ? '★ ' + st.rating.toFixed(1) : '—'}</div><div class="sub">${st.hours ? qty(st.fuel / st.hours) + ' L diesel/h' : ''}</div></div>
      </div>`;
  }

  // ---------- admin: reports ----------

  const reportRange = monthRange();

  function viewReports() {
    const main = $('#main');
    const { from, to } = reportRange;
    const jobs = S.listJobs({ from, to });
    const done = jobs.filter((j) => j.status === 'completed');
    const cancelled = jobs.filter((j) => j.status === 'cancelled');
    const revenue = done.reduce((s, j) => s + S.jobBillTotal(j), 0);
    const collected = jobs.reduce((s, j) => s + S.jobPaid(j), 0);
    const due = done.reduce((s, j) => s + S.jobBalance(j), 0);

    const bySvc = {};
    done.forEach((j) => {
      const r = bySvc[j.service] || (bySvc[j.service] = { jobs: 0, qty: 0, unit: j.unit, hours: 0, revenue: 0 });
      r.jobs++; r.qty += S.num(j.actual?.quantity); r.hours += S.num(j.actual?.hours); r.revenue += S.jobBillTotal(j);
    });
    const byVillage = {};
    done.forEach((j) => {
      const v = j.customer.village || '—';
      const r = byVillage[v] || (byVillage[v] = { jobs: 0, revenue: 0 });
      r.jobs++; r.revenue += S.jobBillTotal(j);
    });

    const opRows = S.listOperators({ includeInactive: true }).map((o) => ({ o, st: S.operatorStats(o.id, from, to) })).filter((r) => r.st.assigned);
    const mRows = S.listMachines({ includeRetired: true }).map((m) => ({ m, st: S.machineStats(m.id, from, to) }));

    main.innerHTML = `
      <div class="page-head"><h1>Reports</h1><button class="btn" id="csv">⬇ Export jobs CSV</button></div>
      <div class="card">
        <form id="range" class="toolbar" style="margin:0;align-items:flex-end">
          <label style="flex:1 1 140px">From <input type="date" name="from" value="${esc(from)}" required></label>
          <label style="flex:1 1 140px">To <input type="date" name="to" value="${esc(to)}" required></label>
          <div class="btn-row">
            <button type="button" class="btn small" data-preset="week">Last 7 days</button>
            <button type="button" class="btn small" data-preset="month">This month</button>
            <button type="button" class="btn small" data-preset="last">Last month</button>
          </div>
        </form>
      </div>
      <div class="grid stats">
        <div class="stat"><div class="label">Jobs completed</div><div class="value">${done.length}</div><div class="sub">${cancelled.length} cancelled · ${jobs.length - done.length - cancelled.length} open</div></div>
        <div class="stat"><div class="label">Revenue billed</div><div class="value">${money(revenue)}</div></div>
        <div class="stat"><div class="label">Collected</div><div class="value">${money(collected)}</div></div>
        <div class="stat"><div class="label">Still due</div><div class="value">${money(due)}</div></div>
      </div>

      <div class="card mt"><h2>By service</h2><div class="table-wrap"><table>
        <thead><tr><th>Service</th><th class="num">Jobs</th><th class="num">Quantity</th><th class="num">Hours</th><th class="num">Revenue</th></tr></thead>
        <tbody>${Object.entries(bySvc).sort((a, b) => b[1].revenue - a[1].revenue).map(([k, r]) => `<tr><td>${esc(k)}</td><td class="num">${r.jobs}</td><td class="num">${qty(r.qty)} ${esc(unitLabel(r.unit, r.qty))}</td><td class="num">${qty(r.hours)}</td><td class="num">${money(r.revenue)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No completed jobs in this period</td></tr>'}</tbody>
      </table></div></div>

      <div class="card"><h2>Operators</h2><div class="table-wrap"><table>
        <thead><tr><th>Operator</th><th class="num">Assigned</th><th class="num">Done</th><th class="num">Hours</th><th class="num">Diesel L</th><th class="num">Revenue</th><th class="num">Collected</th><th class="num">Rating</th></tr></thead>
        <tbody>${opRows.map(({ o, st }) => `<tr><td><a href="#/operator/${esc(o.id)}">${esc(o.name)}</a></td><td class="num">${st.assigned}</td><td class="num">${st.completed}</td><td class="num">${qty(st.hours)}</td><td class="num">${qty(st.fuel)}</td><td class="num">${money(st.revenue)}</td><td class="num">${money(st.collected)}</td><td class="num">${st.rating ? st.rating.toFixed(1) : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No operator activity</td></tr>'}</tbody>
      </table></div></div>

      <div class="card"><h2>Machines</h2><div class="table-wrap"><table>
        <thead><tr><th>Machine</th><th class="num">Jobs</th><th class="num">Hours</th><th>Utilization</th><th class="num">Diesel L</th><th class="num">L/h</th><th class="num">Revenue</th></tr></thead>
        <tbody>${mRows.map(({ m, st }) => `<tr><td><a href="#/machine/${esc(m.id)}">${esc(m.code)}</a></td><td class="num">${st.jobs}</td><td class="num">${qty(st.hours)}</td><td style="min-width:140px">${utilBar(st.utilization)}</td><td class="num">${qty(st.fuel)}</td><td class="num">${st.hours ? qty(st.fuel / st.hours) : '—'}</td><td class="num">${money(st.revenue)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No machines</td></tr>'}</tbody>
      </table></div></div>

      <div class="card"><h2>By village</h2><div class="table-wrap"><table>
        <thead><tr><th>Village</th><th class="num">Jobs</th><th class="num">Revenue</th></tr></thead>
        <tbody>${Object.entries(byVillage).sort((a, b) => b[1].revenue - a[1].revenue).map(([k, r]) => `<tr><td>${esc(k)}</td><td class="num">${r.jobs}</td><td class="num">${money(r.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
      </table></div></div>`;

    const form = $('#range');
    form.addEventListener('change', () => {
      const f = form.elements.from.value, t = form.elements.to.value;
      if (f && t && f <= t) { reportRange.from = f; reportRange.to = t; render(); }
    });
    $$('[data-preset]', form).forEach((b) => b.addEventListener('click', () => {
      const d = new Date();
      if (b.dataset.preset === 'week') { const s = new Date(); s.setDate(s.getDate() - 6); reportRange.from = S.todayStr(s); reportRange.to = S.todayStr(); }
      if (b.dataset.preset === 'month') Object.assign(reportRange, monthRange());
      if (b.dataset.preset === 'last') { reportRange.from = S.todayStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)); reportRange.to = S.todayStr(new Date(d.getFullYear(), d.getMonth(), 0)); }
      render();
    }));
    $('#csv').addEventListener('click', () => exportJobsCsv(jobs));
  }

  function exportJobsCsv(jobs) {
    const cols = ['Booking ID', 'Date', 'Time', 'Status', 'Customer', 'Phone', 'Village', 'Service', 'Crop', 'Booked qty', 'Unit', 'Rate', 'Transport', 'Discount', 'Actual qty', 'Hours', 'Diesel L', 'Operator', 'Machine', 'Bill', 'Paid', 'Balance', 'Payment status', 'Rating', 'Notes'];
    const rows = jobs.map((j) => [
      j.code, j.date, j.time, S.JOB_STATUSES[j.status]?.label, j.customer.name, j.customer.phone, j.customer.village, j.service, j.crop,
      j.quantity, j.unit, j.rate, j.transport, j.discount, j.actual?.quantity ?? '', j.actual?.hours ?? '', j.actual?.fuel ?? '',
      S.getOperator(j.operatorId)?.name || '', S.getMachine(j.machineId)?.code || '', S.jobBillTotal(j), S.jobPaid(j), S.jobBalance(j), S.paymentStatus(j), j.rating || '', j.notes,
    ]);
    const csv = [cols, ...rows].map((r) => r.map((v) => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // keep spreadsheets from treating text as formulas
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    download(`chc-jobs-${S.todayStr()}.csv`, '﻿' + csv, 'text/csv');
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- admin: settings ----------

  function viewSettings() {
    const main = $('#main');
    const st = S.getSettings();
    main.innerHTML = `
      <div class="page-head"><h1>Settings</h1></div>
      <form id="general" class="card">
        <h2>General</h2>
        <div class="fields">
          <label>CHC name <input name="chcName" required value="${esc(st.chcName)}"></label>
          <label>Coordinator PIN <input name="adminPin" required inputmode="numeric" value="${esc(st.adminPin)}"></label>
          <label>Working hours per day <input name="workdayHours" type="number" min="1" max="24" step="0.5" value="${esc(st.workdayHours)}"><span class="hint">Used for utilization %</span></label>
        </div>
        <div class="form-actions"><button class="btn primary">Save</button></div>
      </form>

      <form id="rates" class="card">
        <h2>Services & rate card</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Service</th><th>Charged per</th><th>Rate (₹)</th><th></th></tr></thead>
          <tbody id="rate-rows">${st.services.map((s, i) => rateRow(s, i)).join('')}</tbody>
        </table></div>
        <div class="form-actions"><button type="button" class="btn" id="add-svc">＋ Add service</button><button class="btn primary">Save rate card</button></div>
      </form>

      <div class="card">
        <h2>Data</h2>
        <p class="muted small">Data is stored on this device's browser. Download a backup regularly, and use restore to move data to another device.</p>
        <div class="btn-row">
          <button class="btn" id="backup">⬇ Download backup</button>
          <label class="btn" style="flex-direction:row;color:var(--text)">⬆ Restore backup<input type="file" id="restore" accept="application/json,.json" class="sr-only"></label>
          <button class="btn" id="demo">Load sample data</button>
          <button class="btn danger" id="reset">Erase all data</button>
        </div>
      </div>`;

    $('#general').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      S.updateSettings({ chcName: fd.get('chcName').trim(), adminPin: fd.get('adminPin').trim(), workdayHours: S.num(fd.get('workdayHours')) || 8 });
      toast('Saved'); render();
    });
    const rows = $('#rate-rows');
    $('#add-svc').addEventListener('click', () => {
      rows.insertAdjacentHTML('beforeend', rateRow({ name: '', unit: 'acre', rate: 0 }, rows.children.length));
    });
    rows.addEventListener('click', (e) => { if (e.target.matches('[data-del]')) e.target.closest('tr').remove(); });
    $('#rates').addEventListener('submit', (e) => {
      e.preventDefault();
      const services = $$('tr', rows).map((tr) => ({
        name: $('[name=sname]', tr).value.trim(),
        unit: $('[name=sunit]', tr).value,
        rate: S.num($('[name=srate]', tr).value),
      })).filter((s) => s.name);
      S.updateSettings({ services });
      toast('Rate card saved'); render();
    });
    $('#backup').addEventListener('click', () => download(`chc-backup-${S.todayStr()}.json`, S.exportData(), 'application/json'));
    $('#restore').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!(await confirmDialog('Restoring replaces all data on this device with the backup. Continue?', 'Restore', true))) return;
      try { S.importData(await file.text()); toast('Backup restored'); render(); }
      catch (err) { toast(err.message || 'Could not read that file'); }
    });
    $('#demo').addEventListener('click', async () => {
      if (!(await confirmDialog('Replace all data with sample data?', 'Load sample', true))) return;
      S.replaceState(Demo.buildDemo()); S.setSession({ role: 'admin' }); toast('Sample data loaded'); go('#/dashboard');
    });
    $('#reset').addEventListener('click', async () => {
      if (!(await confirmDialog('Erase ALL operators, machines and jobs from this device? Download a backup first if you need it.', 'Erase everything', true))) return;
      S.resetAll(); S.setSession(null); go('#/');
    });
  }

  function rateRow(s) {
    return `<tr>
      <td><input name="sname" value="${esc(s.name)}" aria-label="Service name" style="min-width:160px"></td>
      <td><select name="sunit" aria-label="Unit">${optionList([['acre', 'Acre'], ['hour', 'Hour']], s.unit)}</select></td>
      <td><input name="srate" type="number" min="0" step="1" value="${esc(s.rate)}" aria-label="Rate" style="min-width:90px"></td>
      <td><button type="button" class="btn small ghost" data-del aria-label="Remove">✕</button></td>
    </tr>`;
  }

  // ---------- operator views ----------

  function viewMyJobs() {
    const main = $('#main');
    const sess = session();
    const op = S.getOperator(sess.operatorId);
    const open = S.listJobs({ operatorId: op.id, status: 'open' });
    const today = S.todayStr();
    const active = open.filter((j) => ['enroute', 'working', 'on_hold'].includes(j.status));
    const todays = open.filter((j) => j.date <= today && !active.includes(j));
    const later = open.filter((j) => j.date > today && !active.includes(j));
    const newOnes = open.filter((j) => j.status === 'assigned');
    main.innerHTML = `
      <div class="page-head"><h1>Hi, ${esc(op.name.split(' ')[0])} 👋</h1></div>
      ${newOnes.length ? `<div class="alert info">You have ${newOnes.length} new job${newOnes.length > 1 ? 's' : ''} to accept.</div>` : ''}
      ${active.length ? `<div class="card"><h2>In progress</h2>${jobList(active, { showOperator: false })}</div>` : ''}
      <div class="card"><h2>Today${todays.some((j) => j.date < today) ? ' & overdue' : ''}</h2>${jobList(todays, { showOperator: false })}</div>
      <div class="card"><h2>Upcoming</h2>${jobList(later, { showOperator: false })}</div>`;
  }

  function viewMyHistory() {
    const main = $('#main');
    const sess = session();
    const done = S.listJobs({ operatorId: sess.operatorId }).filter((j) => ['completed', 'cancelled'].includes(j.status)).reverse();
    main.innerHTML = `<div class="page-head"><h1>History</h1></div>${jobList(done, { showOperator: false })}`;
  }

  function viewMe() {
    const main = $('#main');
    const sess = session();
    const op = S.getOperator(sess.operatorId);
    const { from, to } = monthRange();
    const st = S.operatorStats(op.id, from, to);
    const todayStats = S.operatorStats(op.id, S.todayStr(), S.todayStr());
    main.innerHTML = `
      <div class="page-head"><h1>My stats</h1></div>
      <h2>This month</h2>
      ${operatorStatsBlock(st)}
      <div class="card mt"><h2>Today</h2><dl class="kv">
        <dt>Jobs done</dt><dd>${todayStats.completed}</dd>
        <dt>Hours worked</dt><dd>${qty(todayStats.hours)}</dd>
        <dt>Cash collected</dt><dd>${money(todayStats.collected)}</dd>
      </dl></div>
      <div class="card"><h2>Profile</h2><dl class="kv">
        <dt>Name</dt><dd>${esc(op.name)}</dd>
        <dt>Phone</dt><dd>${esc(op.phone || '—')}</dd>
        <dt>Licence</dt><dd>${esc(op.license || '—')}</dd>
        <dt>Trained for</dt><dd>${esc(op.skills?.join(', ') || '—')}</dd>
      </dl></div>`;
  }

  // ---------- boot ----------

  window.addEventListener('hashchange', render);
  // Re-render when another tab on this device changes the data.
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('chc_operator')) location.reload(); });
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
