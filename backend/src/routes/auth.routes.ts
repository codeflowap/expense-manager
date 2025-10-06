import { Router, Request, Response } from 'express';
import { supabase } from '../db';
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
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{ email, password_hash: passwordHash }])
      .select('id, email')
      .single();

    if (error || !newUser) {
      console.error('Database error:', error);
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

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
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (error || !user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = generateToken({ userId: user.id, email: user.email });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
