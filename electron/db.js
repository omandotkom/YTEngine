const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// Ensure database is stored in User Data folder (persistent)
const dbPath = path.join(app.getPath('userData'), 'ytengine.db');
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    url TEXT NOT NULL,
    format TEXT,
    status TEXT DEFAULT 'queued', -- queued, downloading, completed, failed, cancelled
    filePath TEXT, -- Can store Target Dir initially, then Final File Path on completion
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Helpers
function getHistory(limit = 10, offset = 0) {
  const stmt = db.prepare('SELECT * FROM downloads ORDER BY createdAt DESC LIMIT ? OFFSET ?');
  return stmt.all(limit, offset);
}

function getTotalCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM downloads');
  return stmt.get().count;
}

function addDownload(url, format, title = null, targetDir = null) {
  const stmt = db.prepare('INSERT INTO downloads (url, format, title, status, filePath) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(url, format, title || url, 'queued', targetDir); 
  return info.lastInsertRowid;
}

function updateStatus(id, status, filePath = null, title = null) {
  let query = 'UPDATE downloads SET status = ?, updatedAt = CURRENT_TIMESTAMP';
  const params = [status];

  if (filePath) {
    query += ', filePath = ?';
    params.push(filePath);
  }
  
  if (title) {
    query += ', title = ?';
    params.push(title);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  return stmt.run(...params);
}

function getDownloadById(id) {
  const stmt = db.prepare('SELECT * FROM downloads WHERE id = ?');
  return stmt.get(id);
}

module.exports = {
  db,
  getHistory,
  getTotalCount,
  addDownload,
  updateStatus,
  getDownloadById
};