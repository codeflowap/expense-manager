const pdfParse = require('pdf-parse');

export const extractTextFromPDF = async (pdfBuffer: Buffer): Promise<string> => {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

export const convertPDFToBase64 = (buffer: Buffer): string => {
  return buffer.toString('base64');
};

export const convertBase64ToPDF = (base64: string): Buffer => {
  return Buffer.from(base64, 'base64');
};
