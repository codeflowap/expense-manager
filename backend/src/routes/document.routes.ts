import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { extractTextFromPDF } from '../services/pdf.service';
import { analyzeExpenseStatement, analyzeDailySpending } from '../services/gemini.service';
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
    const document = await prisma.document.create({
      data: {
        userId,
        filename,
        pdfData,
        source: 'manual',
        processed: false
      },
      select: {
        id: true
      }
    });

    // Extract text from PDF
    const pdfText = await extractTextFromPDF(pdfData);

    // Analyze with Gemini in parallel - both calls happen simultaneously
    const [analysisHtml, dailySpending] = await Promise.all([
      analyzeExpenseStatement(pdfText),
      analyzeDailySpending(pdfText)
    ]);

    // Save analysis result and update document in a transaction
    await prisma.$transaction([
      prisma.analysisResult.create({
        data: {
          documentId: document.id,
          llmResponseHtml: analysisHtml,
          dailySpendingJson: JSON.stringify(dailySpending)
        }
      }),
      prisma.document.update({
        where: { id: document.id },
        data: {
          processed: true,
          processedAt: new Date()
        }
      })
    ]);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml,
      dailySpending: dailySpending
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

    const documents = await prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        source: true,
        processed: true,
        receivedAt: true,
        processedAt: true
      },
      orderBy: {
        receivedAt: 'desc'
      }
    });

    res.status(200).json({ documents });
  } catch (error) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count
router.get('/inbox/unread-count', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const count = await prisma.document.count({
      where: {
        userId,
        processed: false
      }
    });

    res.status(200).json({ unreadCount: count });
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
    const document = await prisma.document.findFirst({
      where: {
        userId,
        processed: false
      },
      orderBy: {
        receivedAt: 'desc'
      },
      select: {
        id: true,
        filename: true,
        pdfData: true
      }
    });

    if (!document) {
      res.status(404).json({ error: 'No unprocessed documents found' });
      return;
    }

    // Extract text from PDF
    const pdfText = await extractTextFromPDF(Buffer.from(document.pdfData));

    // Analyze with Gemini in parallel
    const [analysisHtml, dailySpending] = await Promise.all([
      analyzeExpenseStatement(pdfText),
      analyzeDailySpending(pdfText)
    ]);

    // Save analysis result and update document in a transaction
    await prisma.$transaction([
      prisma.analysisResult.create({
        data: {
          documentId: document.id,
          llmResponseHtml: analysisHtml,
          dailySpendingJson: JSON.stringify(dailySpending)
        }
      }),
      prisma.document.update({
        where: { id: document.id },
        data: {
          processed: true,
          processedAt: new Date()
        }
      })
    ]);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml,
      dailySpending: dailySpending
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
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      select: {
        id: true,
        filename: true,
        pdfData: true,
        processed: true
      }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (document.processed) {
      res.status(400).json({ error: 'Document already processed' });
      return;
    }

    // Extract text from PDF
    const pdfText = await extractTextFromPDF(Buffer.from(document.pdfData));

    // Analyze with Gemini in parallel
    const [analysisHtml, dailySpending] = await Promise.all([
      analyzeExpenseStatement(pdfText),
      analyzeDailySpending(pdfText)
    ]);

    // Save analysis result and update document in a transaction
    await prisma.$transaction([
      prisma.analysisResult.create({
        data: {
          documentId: document.id,
          llmResponseHtml: analysisHtml,
          dailySpendingJson: JSON.stringify(dailySpending)
        }
      }),
      prisma.document.update({
        where: { id: document.id },
        data: {
          processed: true,
          processedAt: new Date()
        }
      })
    ]);

    res.status(200).json({
      message: 'Document processed successfully',
      documentId: document.id,
      analysis: analysisHtml,
      dailySpending: dailySpending
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

    // Verify document belongs to user and get result
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      select: {
        id: true,
        filename: true,
        processed: true,
        analysisResult: {
          select: {
            llmResponseHtml: true,
            dailySpendingJson: true,
            createdAt: true
          }
        }
      }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (!document.processed) {
      res.status(400).json({ error: 'Document not yet processed' });
      return;
    }

    if (!document.analysisResult) {
      res.status(404).json({ error: 'Analysis result not found' });
      return;
    }

    res.status(200).json({
      documentId,
      filename: document.filename,
      analysis: document.analysisResult.llmResponseHtml,
      dailySpending: document.analysisResult.dailySpendingJson ? JSON.parse(document.analysisResult.dailySpendingJson) : [],
      analyzedAt: document.analysisResult.createdAt
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download document PDF
router.get('/document/:documentId/download', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { documentId } = req.params;

    // Verify document belongs to user
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      select: {
        filename: true,
        pdfData: true
      }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);

    // Send PDF buffer
    const pdfBuffer = Buffer.isBuffer(document.pdfData) ? document.pdfData : Buffer.from(document.pdfData);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Delete document
router.delete('/document/:documentId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { documentId } = req.params;

    // Verify document belongs to user
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      select: {
        id: true
      }
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Delete document (cascade will handle analysisResult deletion)
    await prisma.document.delete({
      where: { id: documentId }
    });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
