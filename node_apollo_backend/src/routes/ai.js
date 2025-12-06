const express = require('express');
const aiController = require('../controllers/ai');

const router = express.Router();

/**
 * @swagger
 * /api/ai/chat:
 *   post:
 *     summary: Chat with Gemini AI
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                     content:
 *                       type: string
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Streamed text response
 */
router.post('/chat', aiController.chat);

module.exports = router;
