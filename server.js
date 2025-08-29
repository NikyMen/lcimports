const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'tu_clave_secreta_aqui';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Crear directorio de uploads si no existe
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configurar multer para subida de imágenes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Inicializar base de datos
const db = new sqlite3.Database('ecommerce.db');

// Crear tablas
db.serialize(() => {
  // Tabla productos
  db.run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    categoria TEXT NOT NULL,
    imagen TEXT,
    descripcion TEXT,
    stock INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabla usuarios admin
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Crear usuario admin por defecto (username: admin, password: admin123)
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO usuarios (username, password) VALUES (?, ?)`, 
    ['admin', hashedPassword]);
});

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// RUTAS DE AUTENTICACIÓN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM usuarios WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Error del servidor' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  });
});

// RUTAS DE PRODUCTOS (PÚBLICAS)
app.get('/api/productos', (req, res) => {
  db.all('SELECT * FROM productos WHERE activo = 1', (err, productos) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(productos);
  });
});

app.get('/api/productos/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM productos WHERE id = ? AND activo = 1', [id], (err, producto) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener producto' });
    }
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(producto);
  });
});

// RUTAS ADMIN (PROTEGIDAS)
app.get('/api/admin/productos', authenticateToken, (req, res) => {
  db.all('SELECT * FROM productos ORDER BY created_at DESC', (err, productos) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(productos);
  });
});

app.post('/api/admin/productos', authenticateToken, upload.single('imagen'), (req, res) => {
  const { nombre, precio, categoria, descripcion, stock = 0 } = req.body;
  const imagen = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(
    'INSERT INTO productos (nombre, precio, categoria, descripcion, stock, imagen) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, parseFloat(precio), categoria, descripcion, parseInt(stock), imagen],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al crear producto' });
      }
      res.json({ id: this.lastID, mensaje: 'Producto creado exitosamente' });
    }
  );
});

app.put('/api/admin/productos/:id', authenticateToken, upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { nombre, precio, categoria, descripcion, stock } = req.body;
  const imagen = req.file ? `/uploads/${req.file.filename}` : undefined;

  let query = 'UPDATE productos SET nombre = ?, precio = ?, categoria = ?, descripcion = ?, stock = ?';
  let params = [nombre, parseFloat(precio), categoria, descripcion, parseInt(stock)];

  if (imagen) {
    query += ', imagen = ?';
    params.push(imagen);
  }

  query += ' WHERE id = ?';
  params.push(id);

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error al actualizar producto' });
    }
    res.json({ mensaje: 'Producto actualizado exitosamente' });
  });
});

app.delete('/api/admin/productos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar producto' });
    }
    res.json({ mensaje: 'Producto eliminado exitosamente' });
  });
});

// Cambiar contraseña de admin
app.post('/api/admin/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva contraseña son requeridas' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  // Verificar contraseña actual
  db.get('SELECT * FROM usuarios WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Error del servidor' });
    }

    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Actualizar contraseña
    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE usuarios SET password = ? WHERE id = ?', [hashedNewPassword, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar contraseña' });
      }
      res.json({ mensaje: 'Contraseña actualizada exitosamente' });
    });
  });
});

// Servir panel de administración
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`Panel admin en: http://localhost:${PORT}/admin`);
  console.log(`Usuario: admin | Contraseña: admin123`);
});