import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../utils/prisma';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const createClass = async (req: AuthRequest, res: Response) => {
  const { name, subject } = req.body;
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can create classes' });

    const classCode = crypto.randomUUID().substring(0, 6).toUpperCase();

    const newClass = await prisma.class.create({
      data: {
        name,
        subject,
        classCode,
        teacherId: teacher.id,
      },
    });

    res.status(201).json(newClass);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getTeacherClasses = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: { 
        classes: {
          include: {
            _count: {
              select: { students: true }
            }
          }
        } 
      }
    });
    res.json(teacher?.classes || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getClassDetails = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  try {
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        students: {
          include: { user: true }
        },
        sessions: true
      }
    });

    if (!cls) return res.status(404).json({ error: 'Class not found' });
    res.json(cls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getTeacherStats = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;
  const { date } = req.query; // optional YYYY-MM-DD string

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    // Build date range filter if date param is provided
    let sessionDateFilter: any = {};
    if (date) {
      const dateObj = new Date(date as string);
      const startOfDay = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999));
      sessionDateFilter = {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        }
      };
    }

    const classes = await prisma.class.findMany({
      where: { teacherId: teacher.id },
      include: {
        _count: {
          select: { students: true }
        },
        sessions: {
          where: sessionDateFilter,
          include: {
            records: true
          }
        }
      }
    });

    const totalStudents = classes.reduce((acc, c) => acc + c._count.students, 0);

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalRecords = 0;

    classes.forEach(c => {
      c.sessions.forEach(s => {
        s.records.forEach(r => {
          totalRecords++;
          if (r.status === 'PRESENT') totalPresent++;
          else if (r.status === 'ABSENT') totalAbsent++;
        });
      });
    });

    const attendanceRate = totalRecords > 0 ? (totalPresent / totalRecords) * 100 : 0;

    res.json({
      totalStudents,
      attendanceRate: Math.round(attendanceRate),
      totalPresent,
      totalAbsent,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};


export const joinClass = async (req: AuthRequest, res: Response) => {
  const { classCode } = req.body;
  const userId = req.user.id;

  try {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(403).json({ error: 'Only students can join classes' });

    const cls = await prisma.class.findUnique({ where: { classCode } });
    if (!cls) return res.status(404).json({ error: 'Invalid class code' });

    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: { classId: cls.id },
      include: { class: true }
    });

    res.json({ message: 'Successfully joined class', class: updatedStudent.class });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const addStudent = async (req: AuthRequest, res: Response) => {
  const { classId, studentEmail, studentName, rollNumber, fatherName, gender } = req.body;
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can add students' });

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (cls.teacherId !== teacher.id) return res.status(403).json({ error: 'You do not own this class' });

    const finalEmail = studentEmail ? studentEmail : `student_${crypto.randomUUID().substring(0, 8)}@attendance.local`;

    let studentUser = await prisma.user.findUnique({
      where: { email: finalEmail },
      include: { student: true }
    });

    if (!studentUser) {
      // Create new user for the student
      const passwordHash = await bcrypt.hash('password123', 6);
      studentUser = await prisma.user.create({
        data: {
          email: finalEmail,
          passwordHash,
          name: studentName || 'New Student',
          role: 'STUDENT',
          student: {
            create: {
              rollNumber: rollNumber || crypto.randomUUID().substring(0, 8),
              fatherName: fatherName || null,
              gender: gender || null,
              classId: cls.id
            }
          }
        },
        include: { student: true }
      });
      
      return res.json({ message: 'Student created and added successfully', studentName: studentUser.name });
    }

    if (!studentUser.student) {
      return res.status(400).json({ error: 'User exists but is not a student' });
    }

    await prisma.student.update({
      where: { id: studentUser.student.id },
      data: { classId: cls.id }
    });

    // Optionally update the student's name if provided and we want to overwrite
    if (studentName && studentName !== studentUser.name) {
      await prisma.user.update({
        where: { id: studentUser.id },
        data: { name: studentName }
      });
    }

    res.json({ message: 'Student added successfully', studentName: studentName || studentUser.name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getStudentClass = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;

  try {
    const student = await prisma.student.findUnique({
      where: { userId },
      include: { class: true }
    });

    if (!student || !student.class) {
      return res.status(404).json({ error: 'No class joined' });
    }

    res.json(student.class);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteClass = async (req: AuthRequest, res: Response) => {
  const { id } = req.params as { id: string };
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can delete classes' });

    const cls = await prisma.class.findUnique({ where: { id } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (cls.teacherId !== teacher.id) return res.status(403).json({ error: 'You do not own this class' });

    // Manual cleanup since no cascade delete is in schema
    await prisma.attendanceRecord.deleteMany({ where: { session: { classId: id } } });
    await prisma.attendanceSession.deleteMany({ where: { classId: id } });
    await prisma.student.updateMany({ where: { classId: id }, data: { classId: null } });
    await prisma.class.delete({ where: { id } });

    res.json({ message: 'Class deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const removeStudent = async (req: AuthRequest, res: Response) => {
  const { classId, studentId } = req.body;
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can remove students' });

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (cls.teacherId !== teacher.id) return res.status(403).json({ error: 'You do not own this class' });

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.classId !== classId) {
      return res.status(404).json({ error: 'Student not found in this class' });
    }

    await prisma.student.update({
      where: { id: studentId },
      data: { classId: null }
    });

    res.json({ message: 'Student removed from class successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req: AuthRequest, res: Response) => {
  const { classId, studentId, studentName, fatherName, rollNumber, gender } = req.body;
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can update students' });

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (cls.teacherId !== teacher.id) return res.status(403).json({ error: 'You do not own this class' });

    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { user: true } });
    if (!student || student.classId !== classId) {
      return res.status(404).json({ error: 'Student not found in this class' });
    }

    // Update student fields
    await prisma.student.update({
      where: { id: studentId },
      data: {
        rollNumber: rollNumber !== undefined ? rollNumber : student.rollNumber,
        fatherName: fatherName !== undefined ? fatherName : student.fatherName,
        gender: gender !== undefined ? gender : student.gender,
      }
    });

    // Update user name if provided
    if (studentName && student.userId) {
      await prisma.user.update({
        where: { id: student.userId },
        data: { name: studentName }
      });
    }

    res.json({ message: 'Student updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
