const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const db = require('./config/db');

// Test DB Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to MySQL Database');
        connection.release();
    }
});

// Routes
const authRoutes = require('./routes/authRoutes');
const serviciosRoutes = require('./routes/serviciosRoutes');
const citasRoutes = require('./routes/citasRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/citas', citasRoutes);

app.get('/', (req, res) => {
    res.send('Beautybook API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
