/*
 * Data layer for the CHC Operator app.
 *
 * All data lives in one JSON document in localStorage. Every read/write goes
 * through this module, so swapping localStorage for a server API later only
 * means changing load() and save().
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'chc_operator_app_v1';
  const SESSION_KEY = 'chc_operator_session_v1';

  const JOB_STATUSES = {
    pending:   { label: 'Unassigned', order: 0 },
    assigned:  { label: 'Assigned',   order: 1 },
    accepted:  { label: 'Accepted',   order: 2 },
    enroute:   { label: 'On the way', order: 3 },
    working:   { label: 'Working',    order: 4 },
    on_hold:   { label: 'On hold',    order: 5 },
    completed: { label: 'Completed',  order: 6 },
    cancelled: { label: 'Cancelled',  order: 7 },
  };

  // Statuses where the job is still live and occupies an operator/machine.
  const OPEN_STATUSES = ['pending', 'assigned', 'accepted', 'enroute', 'working', 'on_hold'];

  const MACHINE_STATUSES = {
    available:   'Available',
    maintenance: 'Under maintenance',
    breakdown:   'Breakdown',
    retired:     'Retired',
  };

  const PAYMENT_MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque'];

  const DEFAULT_SERVICES = [
    { name: 'Tractor rental',       unit: 'hour', rate: 900 },
    { name: 'Rotavator',            unit: 'acre', rate: 1500 },
    { name: 'Cultivator',           unit: 'acre', rate: 900 },
    { name: 'Plough',               unit: 'acre', rate: 1200 },
    { name: 'Laser land leveler',   unit: 'hour', rate: 1400 },
    { name: 'Seed drill',           unit: 'acre', rate: 1000 },
    { name: 'Happy Seeder',         unit: 'acre', rate: 1800 },
    { name: 'Sprayer',              unit: 'acre', rate: 400 },
    { name: 'Mulcher',              unit: 'acre', rate: 1600 },
    { name: 'Drone spraying',       unit: 'acre', rate: 500 },
    { name: 'Baler',                unit: 'acre', rate: 2000 },
    { name: 'Harvester',            unit: 'acre', rate: 2500 },
  ];

  function emptyState() {
    return {
      version: 1,
      settings: {
        chcName: 'Green Knowledge Global — CHC',
        adminPin: '1234',
        workdayHours: 8,
        services: DEFAULT_SERVICES.map((s) => ({ ...s })),
        seq: {},
      },
      operators: [],
      machines: [],
      jobs: [],
    };
  }

  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error('Could not read saved data', e);
      return emptyState();
    }
  }

  function migrate(data) {
    const base = emptyState();
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      operators: data.operators || [],
      machines: data.machines || [],
      jobs: data.jobs || [],
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save data', e);
      alert('Could not save data on this device. Storage may be full or blocked.');
    }
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ---------- helpers ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function todayStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function nextJobCode(dateStr) {
    const year = (dateStr || todayStr()).slice(0, 4);
    const seq = state.settings.seq;
    seq[year] = (seq[year] || 0) + 1;
    return `CHC-${year}-${String(seq[year]).padStart(4, '0')}`;
  }

  // ---------- session ----------

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function actorName(session) {
    if (!session) return 'System';
    if (session.role === 'admin') return 'Coordinator';
    const op = getOperator(session.operatorId);
    return op ? op.name : 'Operator';
  }

  function operatorIdOf(session) {
    return session && session.role === 'operator' ? session.operatorId : null;
  }

  // ---------- settings ----------

  function getSettings() { return state.settings; }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    save();
  }

  function getService(name) {
    return state.settings.services.find((s) => s.name === name);
  }

  // ---------- operators ----------

  function listOperators({ includeInactive = false } = {}) {
    return state.operators
      .filter((o) => includeInactive || o.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getOperator(id) {
    return state.operators.find((o) => o.id === id);
  }

  function saveOperator(data) {
    if (data.id) {
      const op = getOperator(data.id);
      Object.assign(op, data);
    } else {
      state.operators.push({ active: true, skills: [], ...data, id: uid(), createdAt: nowIso() });
    }
    save();
  }

  function deleteOperator(id) {
    const inUse = state.jobs.some((j) => j.operatorId === id);
    if (inUse) {
      // Keep history intact: deactivate instead of deleting.
      getOperator(id).active = false;
    } else {
      state.operators = state.operators.filter((o) => o.id !== id);
    }
    save();
    return inUse ? 'deactivated' : 'deleted';
  }

  // ---------- machines ----------

  function listMachines({ includeRetired = false } = {}) {
    return state.machines
      .filter((m) => includeRetired || m.status !== 'retired')
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  function getMachine(id) {
    return state.machines.find((m) => m.id === id);
  }

  function saveMachine(data) {
    if (data.id) {
      Object.assign(getMachine(data.id), data);
    } else {
      state.machines.push({ status: 'available', hourMeter: 0, serviceIntervalHrs: 250, lastServiceHrs: 0, ...data, id: uid(), createdAt: nowIso() });
    }
    save();
  }

  function deleteMachine(id) {
    const inUse = state.jobs.some((j) => j.machineId === id);
    if (inUse) {
      getMachine(id).status = 'retired';
    } else {
      state.machines = state.machines.filter((m) => m.id !== id);
    }
    save();
    return inUse ? 'retired' : 'deleted';
  }

  function logService(machineId, note, session) {
    const m = getMachine(machineId);
    m.lastServiceHrs = num(m.hourMeter);
    m.lastServiceDate = todayStr();
    if (m.status === 'maintenance' || m.status === 'breakdown') m.status = 'available';
    m.serviceLog = m.serviceLog || [];
    m.serviceLog.unshift({ at: nowIso(), hours: m.hourMeter, note: note || 'Service done', by: actorName(session) });
    save();
  }

  /** Hours left before the next service is due (negative = overdue). */
  function serviceHoursLeft(m) {
    const interval = num(m.serviceIntervalHrs);
    if (!interval) return Infinity;
    return num(m.lastServiceHrs) + interval - num(m.hourMeter);
  }

  // ---------- jobs ----------

  function getJob(id) {
    return state.jobs.find((j) => j.id === id);
  }

  function listJobs(filter = {}) {
    return state.jobs
      .filter((j) => {
        if (filter.status && filter.status !== 'all') {
          if (filter.status === 'open') { if (!OPEN_STATUSES.includes(j.status)) return false; }
          else if (j.status !== filter.status) return false;
        }
        if (filter.operatorId && j.operatorId !== filter.operatorId) return false;
        if (filter.machineId && j.machineId !== filter.machineId) return false;
        if (filter.date && j.date !== filter.date) return false;
        if (filter.from && j.date < filter.from) return false;
        if (filter.to && j.date > filter.to) return false;
        if (filter.q) {
          const q = filter.q.toLowerCase();
          const hay = [j.code, j.customer.name, j.customer.phone, j.customer.village, j.service].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || a.code.localeCompare(b.code));
  }

  function jobTotal(j) {
    return Math.round(num(j.quantity) * num(j.rate) + num(j.transport) - num(j.discount));
  }

  /** Billable total: uses the actual quantity once the job is completed. */
  function jobBillTotal(j) {
    if (j.status === 'completed' && j.actual && num(j.actual.quantity) > 0) {
      return Math.round(num(j.actual.quantity) * num(j.rate) + num(j.transport) - num(j.discount));
    }
    return jobTotal(j);
  }

  function jobPaid(j) {
    return (j.payments || []).reduce((s, p) => s + num(p.amount), 0);
  }

  function jobBalance(j) {
    if (j.status === 'cancelled') return 0;
    return Math.max(0, jobBillTotal(j) - jobPaid(j));
  }

  function paymentStatus(j) {
    const paid = jobPaid(j);
    if (j.status === 'cancelled') return paid > 0 ? 'Refund due' : '—';
    if (paid <= 0) return 'Pending';
    if (paid < jobBillTotal(j)) return 'Partial';
    return 'Cleared';
  }

  /**
   * Find other open jobs on the same date that already use this operator or machine.
   */
  function findConflicts({ id, date, operatorId, machineId }) {
    if (!date) return [];
    return state.jobs.filter((j) =>
      j.id !== id && j.date === date && OPEN_STATUSES.includes(j.status) &&
      ((operatorId && j.operatorId === operatorId) || (machineId && j.machineId === machineId))
    );
  }

  function pushHistory(job, status, session, note) {
    job.history = job.history || [];
    job.history.push({ at: nowIso(), status, by: actorName(session), note: note || '' });
  }

  function saveJob(data, session) {
    let job;
    if (data.id) {
      job = getJob(data.id);
      const wasAssigned = job.operatorId;
      Object.assign(job, data, { customer: { ...job.customer, ...data.customer } });
      // Assigning / unassigning moves status automatically while the job hasn't started.
      if (['pending', 'assigned', 'accepted'].includes(job.status)) {
        if (job.operatorId && job.operatorId !== wasAssigned) {
          job.status = 'assigned';
          pushHistory(job, 'assigned', session, `Assigned to ${getOperator(job.operatorId)?.name || ''}`);
        } else if (!job.operatorId && job.status !== 'pending') {
          job.status = 'pending';
          pushHistory(job, 'pending', session, 'Operator removed');
        }
      }
      pushHistory(job, job.status, session, 'Job details edited');
    } else {
      job = {
        payments: [],
        history: [],
        ...data,
        id: uid(),
        code: nextJobCode(data.date),
        createdAt: nowIso(),
        status: data.operatorId ? 'assigned' : 'pending',
      };
      pushHistory(job, 'pending', session, 'Booking created');
      if (job.operatorId) pushHistory(job, 'assigned', session, `Assigned to ${getOperator(job.operatorId)?.name || ''}`);
      if (num(data.advance) > 0) {
        job.payments.push({ id: uid(), amount: num(data.advance), mode: data.advanceMode || 'Cash', at: nowIso(), by: actorName(session), note: 'Advance' });
      }
      delete job.advance;
      delete job.advanceMode;
      state.jobs.push(job);
    }
    save();
    return job;
  }

  function setJobStatus(id, status, session, note) {
    const job = getJob(id);
    job.status = status;
    if (status === 'enroute') job.startedTravelAt = nowIso();
    if (status === 'working') job.startedWorkAt = job.startedWorkAt || nowIso();
    pushHistory(job, status, session, note);
    save();
    return job;
  }

  function completeJob(id, actual, payment, rating, session) {
    const job = getJob(id);
    job.actual = {
      quantity: num(actual.quantity),
      hours: num(actual.hours),
      fuel: num(actual.fuel),
      meterEnd: actual.meterEnd === '' || actual.meterEnd == null ? null : num(actual.meterEnd),
      issues: actual.issues || '',
    };
    job.rating = rating ? num(rating) : null;
    job.completedAt = nowIso();
    job.status = 'completed';
    if (payment && num(payment.amount) > 0) {
      job.payments = job.payments || [];
      job.payments.push({ id: uid(), amount: num(payment.amount), mode: payment.mode || 'Cash', at: nowIso(), by: actorName(session), opId: operatorIdOf(session), note: 'Collected on completion' });
    }
    // Keep the machine hour meter current so service reminders work.
    const m = getMachine(job.machineId);
    if (m) {
      if (job.actual.meterEnd != null && job.actual.meterEnd > num(m.hourMeter)) m.hourMeter = job.actual.meterEnd;
      else if (job.actual.meterEnd == null) m.hourMeter = num(m.hourMeter) + job.actual.hours;
    }
    pushHistory(job, 'completed', session, `${job.actual.quantity} ${job.unit === 'hour' ? 'hours billed' : 'acres'} in ${job.actual.hours} h`);
    save();
    return job;
  }

  function reportBreakdown(id, note, session) {
    const job = getJob(id);
    job.status = 'on_hold';
    pushHistory(job, 'on_hold', session, `Breakdown: ${note}`);
    const m = getMachine(job.machineId);
    if (m) {
      m.status = 'breakdown';
      m.serviceLog = m.serviceLog || [];
      m.serviceLog.unshift({ at: nowIso(), hours: m.hourMeter, note: `Breakdown reported on ${job.code}: ${note}`, by: actorName(session) });
    }
    save();
  }

  function addPayment(id, payment, session) {
    const job = getJob(id);
    job.payments = job.payments || [];
    job.payments.push({ id: uid(), amount: num(payment.amount), mode: payment.mode, at: nowIso(), by: actorName(session), opId: operatorIdOf(session), note: payment.note || '' });
    pushHistory(job, job.status, session, `Payment ₹${num(payment.amount)} (${payment.mode})`);
    save();
  }

  function addNote(id, note, session) {
    const job = getJob(id);
    pushHistory(job, job.status, session, note);
    save();
  }

  function deleteJob(id) {
    state.jobs = state.jobs.filter((j) => j.id !== id);
    save();
  }

  // ---------- analytics ----------

  /** Mon–Sat working days between two dates (inclusive). */
  function workingDays(from, to) {
    let count = 0;
    const d = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    while (d <= end) {
      if (d.getDay() !== 0) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function machineStats(machineId, from, to) {
    const jobs = state.jobs.filter((j) => j.machineId === machineId && j.status === 'completed' && j.date >= from && j.date <= to);
    const hours = jobs.reduce((s, j) => s + num(j.actual?.hours), 0);
    const available = workingDays(from, to) * num(state.settings.workdayHours || 8);
    const revenue = jobs.reduce((s, j) => s + jobBillTotal(j), 0);
    return {
      jobs: jobs.length,
      hours,
      quantity: jobs.reduce((s, j) => s + num(j.actual?.quantity), 0),
      fuel: jobs.reduce((s, j) => s + num(j.actual?.fuel), 0),
      revenue,
      utilization: available ? (hours / available) * 100 : 0,
    };
  }

  function operatorStats(operatorId, from, to) {
    const all = state.jobs.filter((j) => j.operatorId === operatorId && j.date >= from && j.date <= to);
    const done = all.filter((j) => j.status === 'completed');
    const rated = done.filter((j) => j.rating);
    return {
      assigned: all.filter((j) => j.status !== 'cancelled').length,
      completed: done.length,
      open: all.filter((j) => OPEN_STATUSES.includes(j.status)).length,
      hours: done.reduce((s, j) => s + num(j.actual?.hours), 0),
      quantity: done.reduce((s, j) => s + num(j.actual?.quantity), 0),
      fuel: done.reduce((s, j) => s + num(j.actual?.fuel), 0),
      revenue: done.reduce((s, j) => s + jobBillTotal(j), 0),
      collected: all.reduce((s, j) => s + (j.payments || []).filter((p) => p.opId === operatorId).reduce((a, p) => a + num(p.amount), 0), 0),
      rating: rated.length ? rated.reduce((s, j) => s + num(j.rating), 0) / rated.length : null,
    };
  }

  /** Last date (YYYY-MM-DD) a machine was out on a job, or null. */
  function machineLastUsed(machineId) {
    const dates = state.jobs
      .filter((j) => j.machineId === machineId && ['completed', 'working', 'enroute'].includes(j.status))
      .map((j) => j.date)
      .filter((d) => d <= todayStr());
    return dates.length ? dates.sort().pop() : null;
  }

  /** Live status of a machine combining its manual status with today's jobs. */
  function machineLiveStatus(m) {
    if (m.status !== 'available') return { key: m.status, label: MACHINE_STATUSES[m.status] };
    const active = state.jobs.find((j) => j.machineId === m.id && ['enroute', 'working'].includes(j.status));
    if (active) return { key: 'infield', label: 'In field', job: active };
    const today = state.jobs.find((j) => j.machineId === m.id && j.date === todayStr() && OPEN_STATUSES.includes(j.status));
    if (today) return { key: 'booked', label: 'Booked today', job: today };
    return { key: 'available', label: 'Available' };
  }

  // ---------- import / export ----------

  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(json) {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.operators) || !Array.isArray(data.machines)) {
      throw new Error('This file is not a CHC Operator backup.');
    }
    state = migrate(data);
    save();
  }

  function resetAll() {
    state = emptyState();
    save();
  }

  function replaceState(newState) {
    state = migrate(newState);
    save();
  }

  global.Store = {
    JOB_STATUSES, OPEN_STATUSES, MACHINE_STATUSES, PAYMENT_MODES,
    uid, todayStr, num,
    getSession, setSession, actorName,
    getSettings, updateSettings, getService,
    listOperators, getOperator, saveOperator, deleteOperator,
    listMachines, getMachine, saveMachine, deleteMachine, logService, serviceHoursLeft,
    getJob, listJobs, saveJob, setJobStatus, completeJob, reportBreakdown, addPayment, addNote, deleteJob,
    jobTotal, jobBillTotal, jobPaid, jobBalance, paymentStatus, findConflicts,
    workingDays, machineStats, operatorStats, machineLastUsed, machineLiveStatus,
    exportData, importData, resetAll, replaceState, subscribe,
    emptyState,
  };
})(window);
