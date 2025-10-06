-- Smart Expense Manager Database Setup Script
-- Run this script in your Supabase SQL Editor

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  pdf_data BYTEA NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('manual', 'pipedream')),
  processed BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP NULL
);

-- Create analysis_results table
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
  llm_response_html TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_received_at ON documents(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_document_id ON analysis_results(document_id);

-- Create a function to automatically update processed_at timestamp
CREATE OR REPLACE FUNCTION update_processed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.processed = TRUE AND OLD.processed = FALSE THEN
    NEW.processed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating processed_at
DROP TRIGGER IF EXISTS trigger_update_processed_at ON documents;
CREATE TRIGGER trigger_update_processed_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_processed_at();

-- Grant necessary permissions (if using RLS)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- You can add RLS policies here based on your security requirements
-- Example: Users can only see their own documents
-- CREATE POLICY "Users can view own documents" ON documents
--   FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE users IS 'Stores user account information';
COMMENT ON TABLE documents IS 'Stores uploaded PDF documents';
COMMENT ON TABLE analysis_results IS 'Stores AI-generated analysis results for documents';
