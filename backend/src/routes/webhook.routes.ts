import { Router, Request, Response } from 'express';
import { supabase } from '../db';
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', user_email)
      .single();

    if (userError || !user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Convert base64 to buffer
    const pdfBuffer = convertBase64ToPDF(pdf_base64);

    // Save document to database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert([{
        user_id: user.id,
        filename,
        pdf_data: pdfBuffer,
        source: 'pipedream',
        processed: false
      }])
      .select('id')
      .single();

    if (docError || !document) {
      console.error('Error saving document from Pipedream:', docError);
      res.status(500).json({ error: 'Failed to save document' });
      return;
    }

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
