const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Función para leer usuarios desde JSON
function leerUsuarios() {
  try {
    const rutaUsuarios = path.join(process.cwd(), 'data', 'usuarios.json');
    const data = fs.readFileSync(rutaUsuarios, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error leyendo usuarios:', error);
    return [];
  }
}

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Buscar usuario en archivo JSON
    const usuarios = leerUsuarios();
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario);
    
    if (!usuarioEncontrado) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const passwordValido = await bcrypt.compare(password, usuarioEncontrado.password);
    
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // JWT sin variable de entorno (clave fija para simplicidad)
    const token = jwt.sign(
      { 
        id: usuarioEncontrado.id, 
        usuario: usuarioEncontrado.usuario,
        rol: usuarioEncontrado.rol
      },
      'mi-clave-secreta-local-2024', // Clave fija
      { expiresIn: '24h' }
    );

    return res.status(200).json({ 
      token,
      usuario: {
        id: usuarioEncontrado.id,
        usuario: usuarioEncontrado.usuario,
        rol: usuarioEncontrado.rol
      }
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};