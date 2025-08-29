import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';

let db;

export function getDb() {
  return db;
}

export async function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database('./database.sqlite', (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('Conectado a SQLite');
      createTables().then(resolve).catch(reject);
    });
  });
}

async function createTables() {
  const run = promisify(db.run.bind(db));
  
  // Tabla productos
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      categoria TEXT NOT NULL,
      imagen TEXT,
      descripcion TEXT,
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Tabla usuarios admin
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Crear usuario admin por defecto
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await run(
    `INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
    ['admin', hashedPassword, 'admin']
  );
  
  console.log('📊 Tablas creadas correctamente');
  console.log('👤 Usuario admin creado: admin / admin123');
}