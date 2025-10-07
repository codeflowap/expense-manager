import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { hashPassword, comparePassword, generateToken } from '../auth';

const router = Router();

// Register endpoint
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        avatarUrl: true
      }
    });

    // Generate JWT token
    const token = generateToken({ userId: newUser.id, email: newUser.email });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: newUser.id, email: newUser.email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        avatarUrl: true
      }
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = generateToken({ userId: user.id, email: user.email });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, avatarUrl: user.avatarUrl }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password endpoint (for forgotten passwords)
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      res.status(400).json({ error: 'Email and new password are required' });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Hash new password and update
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Generate new JWT token
    const token = generateToken({ userId: user.id, email: user.email });

    res.status(200).json({
      message: 'Password reset successfully',
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update avatar endpoint
router.post('/update-avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, avatarUrl } = req.body;

    if (!email || !avatarUrl) {
      res.status(400).json({ error: 'Email and avatar URL are required' });
      return;
    }

    // Update user's avatar
    const user = await prisma.user.update({
      where: { email },
      data: { avatarUrl },
      select: { id: true, email: true, avatarUrl: true }
    });

    res.status(200).json({
      message: 'Avatar updated successfully',
      user
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
