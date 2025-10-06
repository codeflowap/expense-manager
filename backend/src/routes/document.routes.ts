import { Router, Response } from 'express';
import { supabase } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { extractTextFromPDF } from '../services/pdf.service';
import { analyzeExpenseStatement } from '../services/gemini.service';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload PDF manually and process
router.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const userId = req.user!.userId;
    const filename = req.file.originalname;
    const pdfData = req.file.buffer;

    // Save document to database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert([{
        user_id: userId,
        filename,
        pdf_data: pdfData,
        source: 'manual',
        processed: false
      }])
      .select('id')
      .single();

    if (docError || !document) {
      console.error('Error saving document:', docError);
      res.status(500).json({ error: 'Failed to save document' });
      return;
    }

    // Extract text from PDF
    const pdfText = await extractTextFromPDF(pdfData);

    // Analyze with Gemini
    const analysisHtml = await analyzeExpenseStatement(pdfText);

    // Save analysis result
    const { error: resultError } = await supabase
      .from('analysis_results')
      .insert([{
        document_id: document.id,
        llm_response_html: analysisHtml
      }]);

    if (resultError) {
      console.error('Error saving analysis:', resultError);
    }

    // Update document as processed
    await supabase
      .from('documents')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', document.id);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// Get all documents for user (inbox)
router.get('/inbox', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, filename, source, processed, received_at, processed_at')
      .eq('user_id', userId)
      .order('received_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
      return;
    }

    res.status(200).json({ documents: documents || [] });
  } catch (error) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count
router.get('/inbox/unread-count', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const { count, error } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('processed', false);

    if (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
      return;
    }

    res.status(200).json({ unreadCount: count || 0 });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process latest unprocessed document
router.post('/process-latest', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Find latest unprocessed document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, filename, pdf_data')
      .eq('user_id', userId)
      .eq('processed', false)
      .order('received_at', { ascending: false })
      .limit(1)
      .single();

    if (docError || !document) {
      res.status(404).json({ error: 'No unprocessed documents found' });
      return;
    }

    // Extract text from PDF
    const pdfData = Buffer.from(document.pdf_data);
    const pdfText = await extractTextFromPDF(pdfData);

    // Analyze with Gemini
    const analysisHtml = await analyzeExpenseStatement(pdfText);

    // Save analysis result
    const { error: resultError } = await supabase
      .from('analysis_results')
      .insert([{
        document_id: document.id,
        llm_response_html: analysisHtml
      }]);

    if (resultError) {
      console.error('Error saving analysis:', resultError);
    }

    // Update document as processed
    await supabase
      .from('documents')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', document.id);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml
    });
  } catch (error) {
    console.error('Process latest error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// Process specific document by ID
router.post('/process/:documentId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { documentId } = req.params;

    // Find document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, filename, pdf_data, processed')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.processed) {
      res.status(400).json({ error: 'Document already processed' });
      return;
    }

    // Extract text from PDF
    const pdfData = Buffer.from(document.pdf_data);
    const pdfText = await extractTextFromPDF(pdfData);

    // Analyze with Gemini
    const analysisHtml = await analyzeExpenseStatement(pdfText);

    // Save analysis result
    const { error: resultError } = await supabase
      .from('analysis_results')
      .insert([{
        document_id: document.id,
        llm_response_html: analysisHtml
      }]);

    if (resultError) {
      console.error('Error saving analysis:', resultError);
    }

    // Update document as processed
    await supabase
      .from('documents')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', document.id);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml
    });
  } catch (error) {
    console.error('Process document error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// Get analysis result for specific document
router.get('/result/:documentId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { documentId } = req.params;

    // Verify document belongs to user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, filename, processed')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (!document.processed) {
      res.status(400).json({ error: 'Document not yet processed' });
      return;
    }

    // Get analysis result
    const { data: result, error: resultError } = await supabase
      .from('analysis_results')
      .select('llm_response_html, created_at')
      .eq('document_id', documentId)
      .single();

    if (resultError || !result) {
      res.status(404).json({ error: 'Analysis result not found' });
      return;
    }

    res.status(200).json({
      documentId,
      filename: document.filename,
      analysis: result.llm_response_html,
      analyzedAt: result.created_at
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
