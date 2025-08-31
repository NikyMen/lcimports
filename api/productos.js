// Usar una base de datos en la nube como Supabase, PlanetScale o MongoDB Atlas
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para verificar token JWT
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Función para subir imagen a Supabase Storage
async function uploadImageToSupabase(file) {
  const fileBuffer = fs.readFileSync(file.filepath);
  const fileName = `${Date.now()}-${file.originalFilename}`;
  
  const { data, error } = await supabase.storage
    .from('productos-images')
    .upload(fileName, fileBuffer, {
      contentType: file.mimetype,
      upsert: false
    });
  
  if (error) throw error;
  
  // Obtener URL pública
  const { data: { publicUrl } } = supabase.storage
    .from('productos-images')
    .getPublicUrl(fileName);
  
  return publicUrl;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Obtener todos los productos activos
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return res.json(data);
    }
    
    if (req.method === 'POST') {
      // Verificar autenticación para crear productos
      const user = verifyToken(req);
      if (!user) {
        return res.status(401).json({ error: 'No autorizado' });
      }
      
      const form = formidable({
        maxFileSize: 5 * 1024 * 1024, // 5MB
        filter: ({ mimetype }) => mimetype && mimetype.includes('image'),
      });
      
      const [fields, files] = await form.parse(req);
      
      let imagenUrl = null;
      if (files.imagen && files.imagen[0]) {
        imagenUrl = await uploadImageToSupabase(files.imagen[0]);
      }
      
      const { data, error } = await supabase
        .from('productos')
        .insert({
          nombre: fields.nombre[0],
          precio: parseFloat(fields.precio[0]),
          categoria: fields.categoria[0],
          descripcion: fields.descripcion[0],
          stock: parseInt(fields.stock[0]) || 0,
          imagen: imagenUrl,
          activo: true
        })
        .select();
      
      if (error) throw error;
      return res.json(data[0]);
    }
    
    if (req.method === 'PUT') {
      // Verificar autenticación para actualizar productos
      const user = verifyToken(req);
      if (!user) {
        return res.status(401).json({ error: 'No autorizado' });
      }
      
      const form = formidable({
        maxFileSize: 5 * 1024 * 1024,
        filter: ({ mimetype }) => mimetype && mimetype.includes('image'),
      });
      
      const [fields, files] = await form.parse(req);
      const productId = fields.id[0];
      
      let updateData = {
        nombre: fields.nombre[0],
        precio: parseFloat(fields.precio[0]),
        categoria: fields.categoria[0],
        descripcion: fields.descripcion[0],
        stock: parseInt(fields.stock[0]) || 0
      };
      
      // Si hay nueva imagen, subirla
      if (files.imagen && files.imagen[0]) {
        updateData.imagen = await uploadImageToSupabase(files.imagen[0]);
      }
      
      const { data, error } = await supabase
        .from('productos')
        .update(updateData)
        .eq('id', productId)
        .select();
      
      if (error) throw error;
      return res.json(data[0]);
    }
    
    if (req.method === 'DELETE') {
      // Verificar autenticación para eliminar productos
      const user = verifyToken(req);
      if (!user) {
        return res.status(401).json({ error: 'No autorizado' });
      }
      
      const { id } = req.query;
      
      const { error } = await supabase
        .from('productos')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
      return res.json({ message: 'Producto eliminado' });
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
}