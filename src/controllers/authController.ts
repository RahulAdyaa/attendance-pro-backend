import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { generateToken } from '../utils/jwt';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string(),
  role: z.enum(['TEACHER', 'STUDENT']),
  designation: z.string().optional(),
  schoolName: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  rollNumber: z.string().optional(),
  fatherName: z.string().optional(),
  gender: z.string().optional(),
  classCode: z.string().optional(),
});

export const register = async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { email, password, name, role, schoolName, subjects, rollNumber, fatherName, gender, classCode, designation } = validatedData;

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
              designation: designation || 'Professor',
              subjects: (subjects || []).join(','),
            }
          }
        } : {
          student: {
            create: {
              rollNumber: rollNumber || '',
              fatherName: fatherName || null,
              gender: gender || null,
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

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.id, role: user.role });
    res.json({ user, token });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const socialLogin = async (req: Request, res: Response) => {
  const { provider, token, role } = req.body;

  try {
    let email = '';
    let name = '';

    if (provider === 'google') {
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Invalid Google token');
      const data: any = await response.json();
      email = data.email;
      name = data.name;
    } else if (provider === 'facebook') {
      const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${token}`);
      if (!response.ok) throw new Error('Invalid Facebook token');
      const data: any = await response.json();
      email = data.email;
      name = data.name;
    } else {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Could not fetch email from provider' });
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { teacher: true, student: true }
    });

    if (!user) {
      const assignedRole = role || 'STUDENT';
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: assignedRole,
          authProvider: provider,
          ...(assignedRole === 'TEACHER' ? {
            teacher: { create: { schoolName: '', designation: 'Teacher', subjects: '' } }
          } : {
            student: { create: { rollNumber: '' } }
          })
        },
        include: { teacher: true, student: true }
      });
    }

    const jwtToken = generateToken({ id: user.id, role: user.role });
    res.json({ user, token: jwtToken });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const changePassword = async (req: any, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.authProvider !== 'local') {
      return res.status(400).json({ error: 'Cannot change password for social login accounts' });
    }

    if (!user.passwordHash || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect old password' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
