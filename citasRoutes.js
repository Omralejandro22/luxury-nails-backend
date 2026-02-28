const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citasController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Public / Informational Routes
router.get('/disponibilidad', citasController.getDisponibilidad);
router.get('/ocupacion', citasController.getOcupacionMes);

// Client Routes
router.post('/', verifyToken, verifyRole(['cliente']), citasController.createCita);
router.get('/me', verifyToken, verifyRole(['cliente']), citasController.getMyAppointments);
router.post('/:id/review', verifyToken, verifyRole(['cliente']), citasController.addReview);

router.put('/:id/cancel', verifyToken, verifyRole(['cliente']), citasController.cancelCitaClient);

// Admin Routes
router.post('/admin', verifyToken, verifyRole(['admin']), citasController.createCitaAdmin);
router.get('/', verifyToken, verifyRole(['admin']), citasController.getAllAppointments);
router.get('/admin/reviews', verifyToken, verifyRole(['admin']), citasController.getAdminReviews);
router.put('/:id/status', verifyToken, verifyRole(['admin']), citasController.updateCitaStatus);
router.put('/:id', verifyToken, verifyRole(['admin']), citasController.updateCitaAdmin);

module.exports = router;
