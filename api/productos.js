const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rutas de archivos JSON
const PRODUCTOS_FILE = path.join(process.cwd(), 'data', 'productos.json');
const USUARIOS_FILE = path.join(process.cwd(), 'data', 'usuarios.json');

// Función para leer productos
async function leerProductos() {
  try {
    const data = await fs.readFile(PRODUCTOS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Función para escribir productos
async function escribirProductos(productos) {
  await fs.writeFile(PRODUCTOS_FILE, JSON.stringify(productos, null, 2));
}

// Función para verificar JWT
function verificarToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Función para subir imagen a Supabase
async function subirImagen(file) {
  const fileExt = path.extname(file.originalFilename);
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
  
  const fileBuffer = await fs.readFile(file.filepath);
  
  const { data, error } = await supabase.storage
    .from('productos-images')
    .upload(fileName, fileBuffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('productos-images')
    .getPublicUrl(fileName);
    
  return publicUrl;
}

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Obtener todos los productos
      const productos = await leerProductos();
      return res.status(200).json(productos.filter(p => p.activo));
    }
    
    if (req.method === 'POST') {
      // Verificar autenticación
      const usuario = verificarToken(req);
      if (!usuario) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const form = formidable({
        maxFileSize: 5 * 1024 * 1024, // 5MB
        filter: ({ mimetype }) => mimetype && mimetype.includes('image')
      });

      const [fields, files] = await form.parse(req);
      
      let imagenUrl = '';
      if (files.imagen && files.imagen[0]) {
        imagenUrl = await subirImagen(files.imagen[0]);
      }

      const productos = await leerProductos();
      const nuevoId = productos.length > 0 ? Math.max(...productos.map(p => p.id)) + 1 : 1;
      
      const nuevoProducto = {
        id: nuevoId,
        nombre: fields.nombre[0],
        descripcion: fields.descripcion[0],
        precio: parseFloat(fields.precio[0]),
        imagen: imagenUrl,
        categoria: fields.categoria[0] || 'general',
        stock: parseInt(fields.stock[0]) || 0,
        activo: true,
        fecha_creacion: new Date().toISOString()
      };

      productos.push(nuevoProducto);
      await escribirProductos(productos);
      
      return res.status(201).json(nuevoProducto);
    }
    
    if (req.method === 'DELETE') {
      // Verificar autenticación
      const usuario = verificarToken(req);
      if (!usuario) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const { id } = req.query;
      const productos = await leerProductos();
      const productoIndex = productos.findIndex(p => p.id === parseInt(id));
      
      if (productoIndex === -1) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }

      productos[productoIndex].activo = false;
      await escribirProductos(productos);
      
      return res.status(200).json({ message: 'Producto eliminado' });
    }

    return res.status(405).json({ error: 'Método no permitido' });
    
  } catch (error) {
    console.error('Error en API productos:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};