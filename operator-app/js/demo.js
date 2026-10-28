/* Sample data so the app can be explored before real data is entered. */
(function (global) {
  'use strict';

  function shift(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return Store.todayStr(d);
  }

  function iso(days, hour) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  function buildDemo() {
    const s = Store.emptyState();
    const id = Store.uid;

    const ops = [
      { id: id(), name: 'Suresh Kumar',  phone: '9876543210', license: 'TN-38-2016-001234', skills: ['Tractor rental', 'Rotavator', 'Cultivator', 'Plough'], pin: '1111', active: true },
      { id: id(), name: 'Murugan P',     phone: '9876501234', license: 'TN-38-2018-004567', skills: ['Tractor rental', 'Seed drill', 'Happy Seeder', 'Mulcher'], pin: '2222', active: true },
      { id: id(), name: 'Karthik R',     phone: '9123456780', license: 'DGCA-RPC-22-0981', skills: ['Drone spraying', 'Sprayer'], pin: '3333', active: true },
      { id: id(), name: 'Ramesh Babu',   phone: '9001122334', license: 'TN-39-2015-007788', skills: ['Harvester', 'Baler', 'Tractor rental'], pin: '4444', active: true },
    ];
    s.operators = ops.map((o) => ({ ...o, createdAt: iso(-60, 9) }));

    const ms = [
      { id: id(), code: 'TRACT-001', type: 'Tractor',   model: 'Mahindra 575 DI',   regNo: 'TN-38-AB-1234', hourMeter: 1220, serviceIntervalHrs: 250, lastServiceHrs: 1000, insuranceExpiry: shift(40),  status: 'available' },
      { id: id(), code: 'TRACT-002', type: 'Tractor',   model: 'Swaraj 744 FE',     regNo: 'TN-38-CD-5678', hourMeter: 860,  serviceIntervalHrs: 250, lastServiceHrs: 750,  insuranceExpiry: shift(200), status: 'available' },
      { id: id(), code: 'ROT-001',   type: 'Rotavator', model: 'Shaktiman 7 ft',    regNo: '',              hourMeter: 410,  serviceIntervalHrs: 50,  lastServiceHrs: 380,  insuranceExpiry: '',        status: 'available' },
      { id: id(), code: 'SD-001',    type: 'Seed drill',model: 'Fieldking 11 tyne', regNo: '',              hourMeter: 150,  serviceIntervalHrs: 50,  lastServiceHrs: 100,  insuranceExpiry: '',        status: 'available' },
      { id: id(), code: 'DRN-001',   type: 'Drone',     model: 'Garuda Kisan',      regNo: 'UIN-DRN-0098',  hourMeter: 92,   serviceIntervalHrs: 100, lastServiceHrs: 0,    insuranceExpiry: shift(12), status: 'available' },
      { id: id(), code: 'HRV-001',   type: 'Harvester', model: 'Kartar 4000',       regNo: 'TN-39-EF-9012', hourMeter: 640,  serviceIntervalHrs: 250, lastServiceHrs: 500,  insuranceExpiry: shift(90),  status: 'maintenance' },
    ];
    s.machines = ms.map((m) => ({ ...m, createdAt: iso(-60, 9), serviceLog: [] }));

    const [suresh, murugan, karthik, ramesh] = ops;
    const [t1, t2, rot, sd, drn] = ms;

    const customers = [
      { name: 'Ramesh Kumar',   phone: '9443300112', village: 'Kothur' },
      { name: 'Lakshmi Devi',   phone: '9443300223', village: 'Pudur' },
      { name: 'Senthil Nathan', phone: '9443300334', village: 'Vadamalai' },
      { name: 'Anbu FPO',       phone: '9443300445', village: 'Thirumangalam' },
      { name: 'Gopal V',        phone: '9443300556', village: 'Kothur' },
      { name: 'Meena S',        phone: '9443300667', village: 'Alangulam' },
      { name: 'Arul Prakash',   phone: '9443300778', village: 'Pudur' },
    ];

    const seq = { n: 0 };
    function job(day, cust, service, qty, op, mc, status, extra = {}) {
      const svc = s.settings.services.find((x) => x.name === service);
      const year = shift(day).slice(0, 4);
      seq.n++;
      s.settings.seq[year] = seq.n;
      const j = {
        id: id(),
        code: `CHC-${year}-${String(seq.n).padStart(4, '0')}`,
        customer: { ...cust },
        service,
        crop: extra.crop || 'Paddy',
        quantity: qty,
        unit: svc.unit,
        rate: svc.rate,
        transport: extra.transport || 0,
        discount: 0,
        date: shift(day),
        time: extra.time || '07:00',
        location: extra.location || '',
        operatorId: op ? op.id : '',
        machineId: mc ? mc.id : '',
        priority: extra.priority || 'normal',
        notes: extra.notes || '',
        status,
        payments: [],
        history: [{ at: iso(day - 3, 10), status: 'pending', by: 'Coordinator', note: 'Booking created' }],
        createdAt: iso(day - 3, 10),
      };
      if (op) j.history.push({ at: iso(day - 2, 11), status: 'assigned', by: 'Coordinator', note: `Assigned to ${op.name}` });
      if (extra.advance) j.payments.push({ id: id(), amount: extra.advance, mode: 'UPI', at: iso(day - 3, 10), by: 'Coordinator', opId: null, note: 'Advance' });
      if (status === 'completed') {
        const hours = svc.unit === 'hour' ? qty : Math.round(qty * 1.1 * 10) / 10;
        j.actual = { quantity: qty, hours, fuel: Math.round(hours * 4), meterEnd: null, issues: '' };
        j.rating = extra.rating || 5;
        j.completedAt = iso(day, 13);
        j.history.push({ at: iso(day, 6), status: 'enroute', by: op.name, note: '' });
        j.history.push({ at: iso(day, 7), status: 'working', by: op.name, note: '' });
        j.history.push({ at: iso(day, 13), status: 'completed', by: op.name, note: `${qty} ${svc.unit} in ${hours} h` });
        const total = Math.round(qty * svc.rate + (extra.transport || 0));
        const paidNow = extra.unpaid ? 0 : total - (extra.advance || 0);
        if (paidNow > 0) j.payments.push({ id: id(), amount: paidNow, mode: 'Cash', at: iso(day, 13), by: op.name, opId: op.id, note: 'Collected on completion' });
      }
      if (status === 'accepted') j.history.push({ at: iso(-1, 18), status: 'accepted', by: op.name, note: '' });
      if (status === 'working') {
        j.history.push({ at: iso(0, 6), status: 'enroute', by: op.name, note: '' });
        j.history.push({ at: iso(0, 7), status: 'working', by: op.name, note: '' });
        j.startedWorkAt = iso(0, 7);
      }
      s.jobs.push(j);
    }

    // Past completed work
    job(-12, customers[0], 'Rotavator', 5, suresh, rot, 'completed', { advance: 2000, rating: 5 });
    job(-10, customers[1], 'Drone spraying', 8, karthik, drn, 'completed', { crop: 'Cotton', rating: 4 });
    job(-9, customers[3], 'Seed drill', 12, murugan, sd, 'completed', { advance: 4000, rating: 5, transport: 500 });
    job(-7, customers[2], 'Plough', 4, suresh, t1, 'completed', { rating: 3, unpaid: true });
    job(-5, customers[4], 'Tractor rental', 6, murugan, t2, 'completed', { rating: 5 });
    job(-3, customers[5], 'Cultivator', 3, suresh, t1, 'completed', { advance: 1000, unpaid: true, rating: 4 });
    job(-2, customers[6], 'Drone spraying', 10, karthik, drn, 'completed', { crop: 'Maize', rating: 5 });
    job(-1, customers[0], 'Rotavator', 6, suresh, rot, 'completed', { rating: 5 });

    // Today
    job(0, customers[1], 'Rotavator', 4, suresh, rot, 'working', { advance: 1500, time: '07:00' });
    job(0, customers[3], 'Drone spraying', 15, karthik, drn, 'accepted', { crop: 'Paddy', time: '10:00', priority: 'urgent', notes: 'FPO block booking — 3 farmers adjacent fields' });
    job(0, customers[2], 'Seed drill', 5, null, null, 'pending', { time: '14:00' });

    // Upcoming
    job(1, customers[4], 'Mulcher', 7, murugan, t2, 'assigned', { advance: 3000 });
    job(2, customers[5], 'Harvester', 6, ramesh, null, 'assigned', { notes: 'Harvester under maintenance — confirm machine', crop: 'Paddy' });
    job(3, customers[6], 'Cultivator', 4, null, null, 'pending', {});

    return s;
  }

  global.Demo = { buildDemo };
})(window);
