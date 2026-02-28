const db = require('../config/db');

exports.getAllServices = (req, res) => {
    db.query('SELECT * FROM servicios WHERE activo = TRUE', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.getServiceById = (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM servicios WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: 'Service not found' });
        res.json(results[0]);
    });
};

exports.createService = (req, res) => {
    const { nombre, descripcion, duracion, precio } = req.body;

    db.query('INSERT INTO servicios (nombre, descripcion, duracion, precio) VALUES (?, ?, ?, ?)',
        [nombre, descripcion, duracion, precio], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Service created successfully', id: result.insertId });
        });
};

exports.updateService = (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, duracion, precio } = req.body;

    db.query('UPDATE servicios SET nombre = ?, descripcion = ?, duracion = ?, precio = ? WHERE id = ?',
        [nombre, descripcion, duracion, precio, id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Service not found' });
            res.json({ message: 'Service updated successfully' });
        });
};

exports.deleteService = (req, res) => {
    const { id } = req.params;

    // Soft delete
    db.query('UPDATE servicios SET activo = FALSE WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Service not found' });
        res.json({ message: 'Service deleted successfully' });
    });
};
