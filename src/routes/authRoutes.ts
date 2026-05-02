import { Router } from 'express';
import { register, login, socialLogin, changePassword } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/social', socialLogin);
router.put('/password', authenticate, changePassword);

export default router;
