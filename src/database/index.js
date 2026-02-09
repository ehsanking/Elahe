/**
 * Elahe Panel - Database Connection Manager
 */

const Database = require('better-sqlite3');
const config = require('../config/default');
const { migrate } = require('./migrate');
const fs = require('fs');
const path = require('path');

let db = null;

function getDb() {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(config.database.path);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = migrate(config.database.path);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
