const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { db, init } = require('./db');

const app = express();
init();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve employee/admin pages (single-file apps)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'employee.html'));
});
app.get('/employee/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'employee.html'));
});
app.get('/admin/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: record attendance
app.post('/api/check', (req, res) => {
  const { token, emp_id, name, action, lat, lon } = req.body;
  if (!token || !action) return res.status(400).json({ error: 'missing' });

  db.get('SELECT * FROM employees WHERE token = ?', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'invalid token' });
    // enforce location required for employees
    if (row.role === 'employee') {
      if (lat === undefined || lon === undefined || lat === null || lon === null) {
        return res.status(400).json({ error: 'location_required' });
      }
    }

    const theEmpId = emp_id || row.emp_id;
    const theName = name || row.name;
    // prevent repeating same action (in/out) within a short cooldown (30 minutes)
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
    db.get('SELECT ts FROM attendance WHERE emp_id = ? AND action = ? ORDER BY ts DESC LIMIT 1', [theEmpId, action], (err3, last) => {
      if (err3) return res.status(500).json({ error: 'db' });
      const now = Date.now();
      console.log('[CHECK] emp_id=', theEmpId, 'action=', action, 'last=', last && last.ts);
      if (last && last.ts) {
        const lastTs = new Date(last.ts).getTime();
        const diff = now - lastTs;
        console.log('[CHECK] now=', new Date(now).toISOString(), 'lastTs=', new Date(lastTs).toISOString(), 'diffMs=', diff);
        if (diff < COOLDOWN_MS) {
          const retry_after = Math.ceil((COOLDOWN_MS - diff) / 1000);
          return res.status(429).json({ error: 'too_soon', retry_after });
        }
      }
      const ts = new Date().toISOString();
      db.run('INSERT INTO attendance (emp_id, name, action, ts, lat, lon) VALUES (?,?,?,?,?,?)', [theEmpId, theName, action, ts, lat, lon], function(err2) {
        if (err2) return res.status(500).json({ error: 'save failed' });
        return res.json({ ok: true, id: this.lastID, ts });
      });
    });
  });
});

// API: export CSV for admin
app.get('/api/export/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    db.all('SELECT * FROM attendance ORDER BY ts DESC', [], (e, rows) => {
      if (e) return res.status(500).json({ error: 'db' });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
      const header = 'name,emp_id,action,ts,lat,lon\n';
      const lines = rows.map(r => {
        const safe = v => (v===null||v===undefined)?'':('"'+String(v).replace(/"/g,'""')+'"');
        return [safe(r.name), safe(r.emp_id), safe(r.action), safe(r.ts), safe(r.lat), safe(r.lon)].join(',');
      }).join('\n');
      res.send(header + lines);
    });
  });
});

// API: admin fetch records
app.get('/api/records/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    db.all('SELECT * FROM attendance ORDER BY ts DESC LIMIT 1000', [], (e, rows) => {
      if (e) return res.status(500).json({ error: 'db' });
      res.json(rows);
    });
  });
});

// API: public employees list (for dropdown)
app.get('/api/employees/public', (req, res) => {
  db.all('SELECT emp_id, name, token FROM employees WHERE role = "employee" ORDER BY name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db' });
    res.json(rows);
  });
});

// API: validate emp_id and return token (used by employee page)
app.get('/api/employees/validate/:emp_id', (req, res) => {
  const emp_id = req.params.emp_id;
  db.get('SELECT emp_id, name, token FROM employees WHERE emp_id = ? AND role = "employee"', [emp_id], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, emp_id: row.emp_id, name: row.name, token: row.token });
  });
});

// API: admin login by password (returns admin token)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'A$1998qwert';
  if (!password || password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'invalid_password' });
  db.get('SELECT token FROM employees WHERE role = "admin" LIMIT 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(404).json({ error: 'no_admin' });
    res.json({ ok: true, token: row.token });
  });
});

// API: admin - get employees list
app.get('/api/employees/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    db.all('SELECT emp_id, name, token FROM employees WHERE role = "employee" ORDER BY name', [], (e, rows) => {
      if (e) return res.status(500).json({ error: 'db' });
      res.json(rows);
    });
  });
});

// API: admin - add employee
app.post('/api/employees/:token', (req, res) => {
  const token = req.params.token;
  const { emp_id, name } = req.body;
  if (!emp_id || !name) return res.status(400).json({ error: 'missing' });
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    const crypto = require('crypto');
    const newToken = 'emp-' + crypto.randomBytes(6).toString('hex');
    db.run('INSERT INTO employees (emp_id, name, token, role) VALUES (?,?,?,"employee")', [emp_id, name, newToken], function(e2) {
      if (e2) return res.status(500).json({ error: 'insert_failed', detail: e2.message });
      res.json({ ok: true, token: newToken });
    });
  });
});

// API: admin - delete employee by emp_id
app.delete('/api/employees/:token/:emp_id', (req, res) => {
  const token = req.params.token;
  const emp_id = req.params.emp_id;
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    db.run('DELETE FROM employees WHERE emp_id = ? AND role = "employee"', [emp_id], function(e2) {
      if (e2) return res.status(500).json({ error: 'delete_failed' });
      res.json({ ok: true, changes: this.changes });
    });
  });
});

// API: attendance for a specific emp_id
app.get('/api/attendance/emp/:emp_id', (req, res) => {
  const emp_id = req.params.emp_id;
  db.all('SELECT emp_id, name, action, ts, lat, lon FROM attendance WHERE emp_id = ? ORDER BY ts DESC LIMIT 100', [emp_id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db' });
    res.json(rows);
  });
});

// API: clear all attendance records (admin only)
app.post('/api/attendance/clear/:token', (req, res) => {
  const token = req.params.token;
  db.get('SELECT * FROM employees WHERE token = ? AND role = "admin"', [token], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(403).json({ error: 'forbidden' });
    db.run('DELETE FROM attendance', [], function(e2) {
      if (e2) return res.status(500).json({ error: 'delete_failed' });
      res.json({ ok: true, deleted: this.changes });
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
