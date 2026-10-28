# CHC Operator — Job Tracker

A mobile-first web app for the **Customer Hiring Center (CHC)** at Green Knowledge Global. Coordinators use it to take farm-machinery bookings and assign them to operators and machines. Operators use it on their phones to accept jobs, record work done and collect payment.

The app is in [`operator-app/`](operator-app/). It is plain HTML, CSS and JavaScript, so there is nothing to build or install.

## Run it

```bash
cd operator-app
python3 -m http.server 8080
# open http://localhost:8080
```

You can also host the `operator-app/` folder on any static host (GitHub Pages, Netlify, an office server). On a phone, use **Add to Home Screen** to install it like an app. It still opens without network signal once it has loaded.

**First time?** On the sign-in screen, tap **Load sample data**. The coordinator PIN is `1234`. The sample operators' PINs are `1111`, `2222`, `3333` and `4444`.

## What it does

### Coordinator / manager
- **Dashboard**: today's jobs, jobs that need an operator, this month's revenue, outstanding dues, and fleet utilization against the 70% target.
- **Alerts**: jobs with no operator, machine service due or overdue (by hour meter), insurance expiring, breakdowns, idle machines with nothing booked, and dues unpaid for more than 3 days.
- **Bookings**: customer, village, service, crop, acres or hours, rate from the rate card, transport charge, discount and advance payment. Booking IDs are generated automatically (`CHC-2026-0001`).
- **Assignment**: pick an operator and a machine. The form warns about double-booking on the same day, machines under maintenance, and operators not trained for the service.
- **WhatsApp shortcuts**: send job details to the operator and a booking confirmation to the customer with one tap.
- **Machines**: hour meter, service interval, service log, insurance date, status, monthly utilization, revenue and diesel use.
- **Operators**: phone, licence or DGCA certificate, trained services, login PIN, and monthly performance (jobs, hours, cash collected, customer rating).
- **Reports**: any date range, broken down by service, operator, machine and village. Jobs export to CSV for Excel.
- **Settings**: CHC name, PIN, working hours per day, rate card, and backup/restore.

### Operator (on their phone)
- **My jobs**: in progress, today and upcoming, with one-tap call and Google Maps directions.
- **Job workflow**: Accept → Start travel → Reached, start work → Complete. Each step is timestamped in the job's activity log.
- **On completion**: record acres or hours covered, engine hours, diesel, hour meter reading, issues, payment collected (cash/UPI) and the customer's rating. The bill is recalculated from the actual acres covered.
- **Report breakdown**: puts the job on hold and flags the machine for the coordinator.
- **Can't do this job**: sends the job back to the coordinator for re-assignment.
- **My stats**: jobs, hours, cash collected and rating for the month.

## Job statuses

`Unassigned → Assigned → Accepted → On the way → Working → Completed`, plus `On hold` (breakdown) and `Cancelled`.

## Data and limits

All data is stored **in the browser on each device** (localStorage). This works with no server and no internet, but it has one important limit: **phones and the office computer do not share data automatically.** Use **Settings → Download backup** regularly, and restore the backup to move data between devices.

To let operators and the coordinator see the same jobs live on different phones, the next step is a small backend (for example Firebase/Supabase or a simple API). All reads and writes go through `operator-app/js/store.js`, so only that file needs to change.

PINs only separate users on a shared device. They are not real security, so don't treat this as a secure login.

## Files

| File | Purpose |
|---|---|
| `operator-app/index.html` | App entry point |
| `operator-app/js/store.js` | Data model, storage, billing, utilization and stats |
| `operator-app/js/app.js` | Screens, routing and interactions |
| `operator-app/js/demo.js` | Sample data |
| `operator-app/css/styles.css` | Styles (light and dark mode) |
| `operator-app/sw.js`, `manifest.webmanifest` | Offline support and install-to-home-screen |
