const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

function init() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id TEXT UNIQUE,
      name TEXT,
      token TEXT UNIQUE,
      role TEXT DEFAULT 'employee'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id TEXT,
      name TEXT,
      action TEXT,
      ts TEXT,
      lat REAL,
      lon REAL
    )`);

    // insert sample admin and employee if not exists
    db.get("SELECT COUNT(*) as c FROM employees", (err, row) => {
      if (!err && row && row.c === 0) {
        const crypto = require('crypto');
        function genToken(prefix){ return prefix + '-' + crypto.randomBytes(6).toString('hex'); }
        const adminToken = genToken('admin');
        const empToken = genToken('emp');
        db.run("INSERT INTO employees (emp_id, name, token, role) VALUES (?,?,?,?)", ['A001', 'Ahmed', empToken, 'employee']);
        db.run("INSERT INTO employees (emp_id, name, token, role) VALUES (?,?,?,?)", ['ADMIN', 'Manager', adminToken, 'admin']);
        console.log('Inserted sample tokens:');
        console.log('Employee token:', empToken);
        console.log('Admin token:', adminToken);
      }
    });
  });
}

module.exports = { db, init };
