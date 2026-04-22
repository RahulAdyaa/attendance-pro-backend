import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { generateToken } from '../utils/jwt';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string(),
  role: z.enum(['TEACHER', 'STUDENT']),
  schoolName: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  rollNumber: z.string().optional(),
  classCode: z.string().optional(),
});

export const register = async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { email, password, name, role, schoolName, subjects, rollNumber, classCode } = validatedData;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        ...(role === 'TEACHER' ? {
          teacher: {
            create: {
              schoolName: schoolName || '',
              subjects: (subjects || []).join(','),
            }
          }
        } : {
          student: {
            create: {
              rollNumber: rollNumber || '',
            }
          }
        })
      },
      include: {
        teacher: true,
        student: true,
      }
    });

    // If student provided a class code, link them to the class
    if (role === 'STUDENT' && classCode) {
      const cls = await prisma.class.findUnique({ where: { classCode } });
      if (cls) {
        await prisma.student.update({
          where: { userId: user.id },
          data: { classId: cls.id }
        });
      }
    }

    const token = generateToken({ id: user.id, role: user.role });
    res.status(201).json({ user, token });
  } catch (error: any) {
    res.status(400).json({ error: error.errors || error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { teacher: true, student: true }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.id, role: user.role });
    res.json({ user, token });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
