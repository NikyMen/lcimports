import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configuración de multer para subida de imágenes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, webp)'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// GET /api/products - Obtener todos los productos
router.get('/', (req, res) => {
  const db = getDb();
  const { categoria, search } = req.query;
  
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  
  if (categoria && categoria !== 'all') {
    query += ' AND categoria = ?';
    params.push(categoria);
  }
  
  if (search) {
    query += ' AND (nombre LIKE ? OR descripcion LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// GET /api/products/:id - Obtener producto por ID
router.get('/:id', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
    res.json(row);
  });
});

// POST /api/products - Crear nuevo producto (requiere autenticación)
router.post('/', authenticateToken, upload.single('imagen'), (req, res) => {
  const db = getDb();
  const { nombre, precio, categoria, descripcion, stock } = req.body;
  
  if (!nombre || !precio || !categoria) {
    res.status(400).json({ error: 'Faltan campos obligatorios: nombre, precio, categoria' });
    return;
  }
  
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;
  
  const query = `
    INSERT INTO products (nombre, precio, categoria, descripcion, stock, imagen)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [nombre, precio, categoria, descripcion || '', stock || 0, imagen], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({
      id: this.lastID,
      nombre,
      precio,
      categoria,
      descripcion,
      stock,
      imagen,
      message: 'Producto creado exitosamente'
    });
  });
});

// PUT /api/products/:id - Actualizar producto (requiere autenticación)
router.put('/:id', authenticateToken, upload.single('imagen'), (req, res) => {
  const db = getDb();
  const { nombre, precio, categoria, descripcion, stock } = req.body;
  
  let query = `
    UPDATE products 
    SET nombre = ?, precio = ?, categoria = ?, descripcion = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
  `;
  let params = [nombre, precio, categoria, descripcion || '', stock || 0];
  
  if (req.file) {
    query += ', imagen = ?';
    params.push(`/uploads/${req.file.filename}`);
  }
  
  query += ' WHERE id = ?';
  params.push(req.params.id);
  
  db.run(query, params, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
    res.json({ message: 'Producto actualizado exitosamente' });
  });
});

// DELETE /api/products/:id - Eliminar producto (requiere autenticación)
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
    res.json({ message: 'Producto eliminado exitosamente' });
  });
});

export default router;