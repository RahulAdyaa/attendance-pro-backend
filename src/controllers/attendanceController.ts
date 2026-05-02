import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../utils/prisma';

export const markAttendance = async (req: AuthRequest, res: Response) => {
  const { classId, date, records } = req.body; // records: [{studentId, status, note}]
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(403).json({ error: 'Only teachers can mark attendance' });

    const dateObj = new Date(date);
    const targetDate = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 12, 0, 0));

    // Find if a session already exists for this date
    const sessions = await prisma.attendanceSession.findMany({
      where: { classId },
      include: { records: true }
    });

    const existingSession = sessions.find(s => {
      return s.date.getFullYear() === targetDate.getFullYear() &&
             s.date.getMonth() === targetDate.getMonth() &&
             s.date.getDate() === targetDate.getDate();
    });

    if (existingSession) {
      // Delete existing records
      await prisma.attendanceRecord.deleteMany({
        where: { sessionId: existingSession.id }
      });
      // Add new records
      const updatedSession = await prisma.attendanceSession.update({
        where: { id: existingSession.id },
        data: {
          records: {
            create: records.map((r: any) => ({
              studentId: r.studentId,
              status: r.status,
              note: r.note,
            }))
          }
        },
        include: { records: true }
      });
      return res.status(200).json(updatedSession);
    }

    const session = await prisma.attendanceSession.create({
      data: {
        classId,
        teacherId: teacher.id,
        date: targetDate,
        records: {
          create: records.map((r: any) => ({
            studentId: r.studentId,
            status: r.status,
            note: r.note,
          }))
        }
      },
      include: { records: true }
    });

    res.status(201).json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAttendanceHistory = async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId as string;

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: { classId },
      include: { records: true },
      orderBy: { date: 'desc' }
    });
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getStudentAttendance = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;

  try {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: student.id },
      include: {
        session: {
          select: { date: true, class: { select: { name: true } } }
        }
      },
      orderBy: { session: { date: 'desc' } }
    });

    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getTeacherAttendanceHistory = async (req: AuthRequest, res: Response) => {
  const userId = req.user.id;

  try {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        class: {
          teacherId: teacher.id
        }
      },
      include: {
        class: true,
        _count: {
          select: { records: true }
        },
        records: {
          select: { 
            status: true,
            student: {
              select: {
                id: true,
                user: {
                  select: { name: true }
                }
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    const formattedSessions = sessions.map(s => {
      const present = s.records.filter(r => r.status === 'PRESENT').length;
      const absent = s.records.filter(r => r.status === 'ABSENT').length;
      const late = s.records.filter(r => r.status === 'LATE').length;
      const excused = s.records.filter(r => r.status === 'EXCUSED').length;

      return {
        id: s.id,
        date: s.date,
        className: s.class.name,
        present,
        absent,
        late,
        excused,
        records: s.records.map((r: any) => ({
          studentId: r.student?.id,
          name: r.student?.user?.name || 'Unknown',
          status: r.status
        }))
      };
    });

    res.json(formattedSessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
