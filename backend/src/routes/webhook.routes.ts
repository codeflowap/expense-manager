import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { convertBase64ToPDF } from '../services/pdf.service';

const router = Router();

// Pipedream webhook endpoint
router.post('/pipedream', async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_email, filename, pdf_base64 } = req.body;

    if (!user_email || !filename || !pdf_base64) {
      res.status(400).json({ error: 'Missing required fields: user_email, filename, pdf_base64' });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: user_email },
      select: { id: true }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Convert base64 to buffer
    const pdfBuffer = convertBase64ToPDF(pdf_base64);

    // Save document to database
    const document = await prisma.document.create({
      data: {
        userId: user.id,
        filename,
        pdfData: pdfBuffer,
        source: 'pipedream',
        processed: false
      },
      select: {
        id: true
      }
    });

    res.status(200).json({
      message: 'Document received successfully',
      documentId: document.id
    });
  } catch (error) {
    console.error('Pipedream webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
