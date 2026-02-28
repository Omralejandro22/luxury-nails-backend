const express = require('express');
const router = express.Router();
const serviciosController = require('../controllers/serviciosController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Public route to view services
router.get('/', serviciosController.getAllServices);
router.get('/:id', serviciosController.getServiceById);

// Admin protected routes
router.post('/', verifyToken, verifyRole(['admin']), serviciosController.createService);
router.put('/:id', verifyToken, verifyRole(['admin']), serviciosController.updateService);
router.delete('/:id', verifyToken, verifyRole(['admin']), serviciosController.deleteService);

module.exports = router;
