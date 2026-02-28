const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { nombre, email, password, telefono } = req.body;

    // By default, new registrations via public API are clients. 
    // Admins should be added manually via DB or a protected route.
    const rol = 'cliente';

    try {
        // Check if user exists
        db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length > 0) return res.status(400).json({ message: 'Email already registered' });

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert User
            db.query('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
                [nombre, email, hashedPassword, rol], (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });

                    const userId = result.insertId;

                    // If client, add to clientes table
                    if (rol === 'cliente') {
                        db.query('INSERT INTO clientes (usuario_id, telefono) VALUES (?, ?)',
                            [userId, telefono], (err) => {
                                if (err) return res.status(500).json({
                                    message: 'User created but failed to create client profile',
                                    error: err.message
                                });
                                res.status(201).json({ message: 'User registered successfully' });
                            });
                    } else {
                        res.status(201).json({ message: 'Admin registered successfully' });
                    }
                });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.login = (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user.id, rol: user.rol, nombre: user.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
    });
};

exports.getEmployees = (req, res) => {
    db.query('SELECT id, nombre, email FROM usuarios WHERE rol = "empleado"', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};
