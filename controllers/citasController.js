const db = require('../config/db');

// Client: Book Appointment
exports.createCita = async (req, res) => {
    const { fecha, hora, servicios, empleadoId } = req.body;
    const userId = req.user.id;

    if (!servicios || servicios.length === 0) {
        return res.status(400).json({ message: 'No services selected' });
    }

    db.getConnection(async (err, connection) => {
        if (err) return res.status(500).json({ error: 'Database connection failed' });

        // Helper to promisify query using the specific connection
        const query = (sql, args) => {
            return new Promise((resolve, reject) => {
                connection.query(sql, args, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        try {
            await query('START TRANSACTION');

            // 1. Get Client ID
            const clientRows = await query('SELECT id FROM clientes WHERE usuario_id = ?', [userId]);
            if (clientRows.length === 0) {
                await query('ROLLBACK');
                connection.release();
                return res.status(404).json({ message: 'Client profile not found' });
            }
            const clienteId = clientRows[0].id;

            // 2. Create Cita
            const citaResult = await query(
                'INSERT INTO citas (cliente_id, fecha, hora, estado, empleado_id) VALUES (?, ?, ?, ?, ?)',
                [clienteId, fecha, hora, 'pendiente', empleadoId || null]
            );
            const citaId = citaResult.insertId;

            // 3. Process Services
            let total = 0;
            for (const servicioId of servicios) {
                const serviceRows = await query('SELECT precio FROM servicios WHERE id = ?', [servicioId]);
                if (serviceRows.length === 0) {
                    throw new Error(`Service with ID ${servicioId} not found`);
                }
                const precio = parseFloat(serviceRows[0].precio);
                total += precio;

                await query(
                    'INSERT INTO cita_servicios (cita_id, servicio_id, precio_al_momento) VALUES (?, ?, ?)',
                    [citaId, servicioId, precio]
                );
            }

            // 4. Update Total
            await query('UPDATE citas SET total = ? WHERE id = ?', [total, citaId]);

            await query('COMMIT');
            connection.release();
            res.status(201).json({ message: 'Appointment booked successfully', citaId });

        } catch (error) {
            await query('ROLLBACK');
            connection.release();
            // Handle specific logic errors vs DB errors
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ error: error.message });
        }
    });
};

// Client: Get History
exports.getMyAppointments = (req, res) => {
    const userId = req.user.id;
    db.query(`
        SELECT c.*, s.nombre as servicio_nombre, s.precio, s.duracion, emp.nombre as empleado_nombre 
        FROM citas c
        JOIN clientes cl ON c.cliente_id = cl.id
        LEFT JOIN cita_servicios cs ON c.id = cs.cita_id
        LEFT JOIN servicios s ON cs.servicio_id = s.id
        LEFT JOIN usuarios emp ON c.empleado_id = emp.id
        WHERE cl.usuario_id = ?
        ORDER BY c.fecha DESC, c.hora DESC
    `, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Group by Cita ID (since joins duplicate rows for multiple services)
        const citas = {};
        results.forEach(row => {
            if (!citas[row.id]) {
                citas[row.id] = {
                    id: row.id,
                    fecha: row.fecha,
                    hora: row.hora,
                    estado: row.estado,
                    total: row.total,
                    empleado: row.empleado_nombre || 'No asignado',
                    servicios: []
                };
            }
            if (row.servicio_nombre) {
                citas[row.id].servicios.push({
                    nombre: row.servicio_nombre,
                    precio: row.precio,
                    duracion: row.duracion
                });
            }
        });

        res.json(Object.values(citas));
    });
};

// Admin: Get All Appointments
exports.getAllAppointments = (req, res) => {
    db.query(`
        SELECT c.*, u.nombre as cliente_nombre, u.email, cl.telefono,
               emp.nombre as empleado_nombre,
               s.id as servicio_id, s.nombre as servicio_nombre, s.precio, s.duracion
        FROM citas c
        JOIN clientes cl ON c.cliente_id = cl.id
        JOIN usuarios u ON cl.usuario_id = u.id
        LEFT JOIN usuarios emp ON c.empleado_id = emp.id
        LEFT JOIN cita_servicios cs ON c.id = cs.cita_id
        LEFT JOIN servicios s ON cs.servicio_id = s.id
        ORDER BY c.fecha DESC, c.hora DESC
    `, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        const citas = {};
        results.forEach(row => {
            if (!citas[row.id]) {
                citas[row.id] = {
                    id: row.id,
                    cliente_nombre: row.cliente_nombre,
                    email: row.email,
                    telefono: row.telefono,
                    fecha: row.fecha,
                    hora: row.hora,
                    estado: row.estado,
                    total: row.total,
                    empleado_id: row.empleado_id,
                    empleado: row.empleado_nombre || 'No asignado',
                    servicios: []
                };
            }
            if (row.servicio_id) {
                citas[row.id].servicios.push({
                    id: row.servicio_id,
                    nombre: row.servicio_nombre,
                    precio: row.precio,
                    duracion: row.duracion
                });
            }
        });

        res.json(Object.values(citas));
    });
};

// Admin: Update Status
exports.updateCitaStatus = (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // 'confirmada', 'cancelada', 'completada'

    db.query('UPDATE citas SET estado = ? WHERE id = ?', [estado, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Appointment not found' });
        res.json({ message: 'Appointment status updated' });
    });
};

// Admin: Create Appointment for Walk-in / Phone clients
exports.createCitaAdmin = async (req, res) => {
    const { nombre, telefono, email, fecha, hora, servicios, empleadoId } = req.body;

    if (!nombre) return res.status(400).json({ message: 'Client name is required' });
    if (!servicios || servicios.length === 0) return res.status(400).json({ message: 'No services selected' });

    db.getConnection(async (err, connection) => {
        if (err) return res.status(500).json({ error: 'Database connection failed' });

        const query = (sql, args) => new Promise((resolve, reject) => {
            connection.query(sql, args, (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });

        try {
            await query('START TRANSACTION');

            // 1. Resolve or Create Client
            const clientEmail = email || `walkin_${Date.now()}@beautybook.local`;
            let clienteId = null;

            // Check if user exists by email (or phone if we wanted, but email is UNIQUE in DB)
            const userRows = await query('SELECT id FROM usuarios WHERE email = ?', [clientEmail]);

            if (userRows.length > 0) {
                const usuarioId = userRows[0].id;
                // Get their client profile
                const clientRows = await query('SELECT id FROM clientes WHERE usuario_id = ?', [usuarioId]);
                if (clientRows.length > 0) {
                    clienteId = clientRows[0].id;
                } else {
                    // Has user account but no client profile (rare but possible if admin/employee books)
                    const newClient = await query('INSERT INTO clientes (usuario_id, telefono) VALUES (?, ?)', [usuarioId, telefono]);
                    clienteId = newClient.insertId;
                }
            } else {
                // Completely new user
                const bcrypt = require('bcryptjs');
                const hashedPass = await bcrypt.hash(Date.now().toString(), 10); // Random password they don't know

                const newUser = await query('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
                    [nombre, clientEmail, hashedPass, 'cliente']);

                const newClient = await query('INSERT INTO clientes (usuario_id, telefono) VALUES (?, ?)',
                    [newUser.insertId, telefono]);

                clienteId = newClient.insertId;
            }

            // 2. Create Cita
            const citaResult = await query(
                'INSERT INTO citas (cliente_id, fecha, hora, estado, empleado_id) VALUES (?, ?, ?, ?, ?)',
                [clienteId, fecha, hora, 'confirmada', empleadoId || null] // Admin books are auto-confirmed usually
            );
            const citaId = citaResult.insertId;

            // 3. Process Services
            let total = 0;
            for (const servicioId of servicios) {
                const serviceRows = await query('SELECT precio FROM servicios WHERE id = ?', [servicioId]);
                if (serviceRows.length === 0) throw new Error(`Service ID ${servicioId} not found`);

                const precio = parseFloat(serviceRows[0].precio);
                total += precio;

                await query(
                    'INSERT INTO cita_servicios (cita_id, servicio_id, precio_al_momento) VALUES (?, ?, ?)',
                    [citaId, servicioId, precio]
                );
            }

            // 4. Update Total
            await query('UPDATE citas SET total = ? WHERE id = ?', [total, citaId]);

            await query('COMMIT');
            connection.release();
            res.status(201).json({ message: 'Appointment created successfully', citaId });

        } catch (error) {
            await query('ROLLBACK');
            connection.release();
            res.status(500).json({ error: error.message });
        }
    });
};

// Client: Cancel Appointment (Only own appointments, if pending or confirmed)
exports.cancelCitaClient = (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    db.query(`
        SELECT c.* FROM citas c
        JOIN clientes cl ON c.cliente_id = cl.id
        WHERE c.id = ? AND cl.usuario_id = ?
    `, [id, userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Appointment not found or not authorized' });

        const cita = results[0];
        if (cita.estado === 'completada' || cita.estado === 'cancelada') {
            return res.status(400).json({ message: `Cannot cancel an appointment that is already ${cita.estado}` });
        }

        db.query('UPDATE citas SET estado = ? WHERE id = ?', ['cancelada', id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Appointment cancelled successfully' });
        });
    });
};

// Client/Public: Get Availability
exports.getDisponibilidad = (req, res) => {
    const { fecha, empleadoId } = req.query;

    if (!fecha) {
        return res.status(400).json({ message: 'Fecha is required' });
    }

    let query = `
        SELECT hora FROM citas 
        WHERE fecha = ? AND estado IN ('pendiente', 'confirmada')
    `;
    const params = [fecha];

    if (empleadoId) {
        query += " AND empleado_id = ?";
        params.push(empleadoId);
    }

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Return an array of just the time strings (e.g., "10:00")
        const horasOcupadas = results.map(row => row.hora.substring(0, 5));
        res.json({ horasOcupadas });
    });
};

// Public: Get Occupancy for a Month
exports.getOcupacionMes = (req, res) => {
    const { mes } = req.query; // e.g. "2024-05"

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
        return res.status(400).json({ message: 'A valid month in YYYY-MM format is required' });
    }

    const query = `
        SELECT fecha, COUNT(*) as totalCitas 
        FROM citas 
        WHERE fecha LIKE ? AND estado IN ('pendiente', 'confirmada')
        GROUP BY fecha
    `;
    const params = [`${mes}%`];

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Expected format: [{ fecha: '2024-05-15', totalCitas: 4 }]
        const ocupacionPorDia = results.reduce((acc, row) => {
            // Need to convert date to ISO string (YYYY-MM-DD) without time component shift
            const f = new Date(row.fecha);
            const dateStr = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
            acc[dateStr] = row.totalCitas;
            return acc;
        }, {});

        res.json({ ocupacionPorDia });
    });
};

// Client: Add Review
exports.addReview = (req, res) => {
    const { id } = req.params; // Cita ID
    const { calificacion, comentario } = req.body;
    const userId = req.user.id; // from token

    // Verify appointment belongs to user and is completed
    db.query(`
        SELECT c.* FROM citas c
        JOIN clientes cl ON c.cliente_id = cl.id
        WHERE c.id = ? AND cl.usuario_id = ?
    `, [id, userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Appointment not found or not authorized' });

        const cita = results[0];
        if (cita.estado !== 'completada') {
            return res.status(400).json({ message: 'Can only review completed appointments' });
        }

        db.query('INSERT INTO comentarios (cita_id, calificacion, comentario) VALUES (?, ?, ?)',
            [id, calificacion, comentario], (err, result) => {
                if (err) {
                    // Check for duplicate review (unique constraint on cita_id)
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ message: 'Review already exists for this appointment' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ message: 'Review added successfully' });
            });
    });
};

// Admin: Update Appointment Details (Date, Time, Empleado, Servicios)
exports.updateCitaAdmin = async (req, res) => {
    const { id } = req.params;
    const { fecha, hora, servicios, empleadoId } = req.body;

    if (!servicios || servicios.length === 0) {
        return res.status(400).json({ message: 'No services selected' });
    }

    db.getConnection(async (err, connection) => {
        if (err) return res.status(500).json({ error: 'Database connection failed' });

        const query = (sql, args) => {
            return new Promise((resolve, reject) => {
                connection.query(sql, args, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        try {
            await query('START TRANSACTION');

            // 1. Check if appointment exists
            const citaRows = await query('SELECT * FROM citas WHERE id = ?', [id]);
            if (citaRows.length === 0) {
                await query('ROLLBACK');
                connection.release();
                return res.status(404).json({ message: 'Appointment not found' });
            }

            // 2. Update basic info in Citas
            await query(
                'UPDATE citas SET fecha = ?, hora = ?, empleado_id = ? WHERE id = ?',
                [fecha, hora, empleadoId || null, id]
            );

            // 3. Clear old services
            await query('DELETE FROM cita_servicios WHERE cita_id = ?', [id]);

            // 4. Insert new services and calculate total
            let total = 0;
            for (const servicioId of servicios) {
                const serviceRows = await query('SELECT precio FROM servicios WHERE id = ?', [servicioId]);
                if (serviceRows.length === 0) {
                    throw new Error(`Service with ID ${servicioId} not found`);
                }
                const precio = parseFloat(serviceRows[0].precio);
                total += precio;

                await query(
                    'INSERT INTO cita_servicios (cita_id, servicio_id, precio_al_momento) VALUES (?, ?, ?)',
                    [id, servicioId, precio]
                );
            }

            // 5. Update Total
            await query('UPDATE citas SET total = ? WHERE id = ?', [total, id]);

            await query('COMMIT');
            connection.release();
            res.status(200).json({ message: 'Appointment updated successfully', citaId: id });

        } catch (error) {
            await query('ROLLBACK');
            connection.release();
            if (error.message.includes('not found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({ error: error.message });
        }
    });
};

// Admin: Get All Reviews
exports.getAdminReviews = (req, res) => {
    db.query(`
        SELECT com.id as review_id, com.calificacion, com.comentario, com.fecha as fecha_comentario,
               c.fecha as fecha_cita, c.hora,
               u.nombre as cliente_nombre
        FROM comentarios com
        JOIN citas c ON com.cita_id = c.id
        JOIN clientes cl ON c.cliente_id = cl.id
        JOIN usuarios u ON cl.usuario_id = u.id
        ORDER BY com.fecha DESC
    `, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};
