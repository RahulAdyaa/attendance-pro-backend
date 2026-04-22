import { Router } from 'express';
import { markAttendance, getAttendanceHistory, getStudentAttendance, getTeacherAttendanceHistory } from '../controllers/attendanceController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/', markAttendance);
router.get('/history/teacher', getTeacherAttendanceHistory);
router.get('/history/:classId', getAttendanceHistory);
router.get('/student', getStudentAttendance);

export default router;
