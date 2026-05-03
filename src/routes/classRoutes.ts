import { Router } from 'express';
import { 
  createClass, 
  getTeacherClasses, 
  getClassDetails, 
  getTeacherStats,
  joinClass,
  addStudent,
  removeStudent,
  updateStudent,
  getStudentClass,
  deleteClass
} from '../controllers/classController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/', createClass);
router.post('/join', joinClass);
router.post('/add-student', addStudent);
router.post('/remove-student', removeStudent);
router.post('/update-student', updateStudent);
router.get('/student/current', getStudentClass);
router.get('/teacher/stats', getTeacherStats);
router.get('/teacher', getTeacherClasses);
router.get('/:id', getClassDetails);
router.delete('/:id', deleteClass);

export default router;
