import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database initialization script
export const initDatabase = async () => {
  try {
    // Check if tables exist by querying them
    const { error: usersError } = await supabase.from('users').select('id').limit(1);
    const { error: documentsError } = await supabase.from('documents').select('id').limit(1);
    const { error: resultsError } = await supabase.from('analysis_results').select('id').limit(1);

    if (usersError || documentsError || resultsError) {
      console.log('Database tables may not exist. Please create them manually in Supabase:');
      console.log(`
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
  source VARCHAR(50) NOT NULL,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_analysis_results_document_id ON analysis_results(document_id);
      `);
    } else {
      console.log('✓ Database tables exist and are accessible');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};
