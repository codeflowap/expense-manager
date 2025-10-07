# Smart Expense Manager

An AI-powered expense tracking system that automatically analyzes bank statements and credit card PDFs using Google Gemini AI.

## Features

- 🔐 User authentication with JWT
- 📄 Manual PDF upload and analysis
- 📧 Automated email processing via Pipedream webhook
- 🤖 AI-powered expense categorization using Google Gemini
- 📊 Real-time inbox notifications
- 💾 Secure document storage in PostgreSQL
- 🎨 Clean, modern UI with Google Gemini color palette

## Tech Stack

**Backend:**
- Node.js + Express + TypeScript
- Supabase (PostgreSQL)
- Google Gemini API
- JWT Authentication
- pdf-parse for PDF text extraction

**Frontend:**
- Vanilla HTML/CSS/JavaScript
- Responsive design
- Real-time polling for notifications

**Deployment:**
- Docker & Docker Compose
- Google Cloud Build
- Google Cloud Run

## Setup Instructions

### 1. Prerequisites

- Node.js 20+
- Supabase account
- Google API key (Gemini)
- Docker (for deployment)

### 2. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the script in `backend/setup-database.sql`
4. Verify tables are created: users, documents, analysis_results

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Update .env with your credentials:
# - GOOGLE_API_KEY
# - SUPABASE_URL
# - SUPABASE_KEY
# - JWT_SECRET

# Run development server
npm run dev
```

The server will start on http://localhost:3000

### 4. Frontend Setup

The frontend is served by the backend as static files from the `public/` directory.

Update the API_URL in `public/app.js` if deploying to production:
```javascript
const API_URL = 'http://localhost:3000/api'; // Development
// const API_URL = 'https://your-app.run.app/api'; // Production
```

### 5. Test the Application

1. Open http://localhost:3000 in your browser
2. Register a new account
3. Upload a PDF bank statement
4. Wait for AI analysis
5. View results

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Documents
- `POST /api/upload` - Upload PDF manually (requires auth)
- `GET /api/inbox` - Get all documents (requires auth)
- `GET /api/inbox/unread-count` - Get unprocessed document count (requires auth)
- `POST /api/process-latest` - Process most recent unprocessed document (requires auth)
- `POST /api/process/:documentId` - Process specific document (requires auth)
- `GET /api/result/:documentId` - Get analysis result (requires auth)

### Webhook
- `POST /api/webhook/pipedream` - Receive PDF from Pipedream automation

## Pipedream Webhook Configuration

To automate email processing:

1. Create a Pipedream workflow
2. Add Gmail trigger to watch for emails with PDF attachments
3. Add a Code step to extract PDF attachment:

```javascript
export default defineComponent({
  async run({ steps, $ }) {
    const attachment = steps.trigger.event.attachments[0];
    const pdfBase64 = attachment.data; // Base64 encoded PDF

    await $.send.http({
      method: 'POST',
      url: 'https://your-backend-url/api/webhook/pipedream',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        user_email: 'user@example.com',
        filename: attachment.filename,
        pdf_base64: pdfBase64
      }
    });
  }
});
```

## Docker Deployment

### Local Docker

```bash
# Build and run with docker-compose
docker-compose up --build

# Access at http://localhost:3000
```

### Google Cloud Platform

1. Set up Google Cloud Project
2. Enable Cloud Build and Cloud Run APIs
3. Configure Secret Manager with environment variables:
   - `_GOOGLE_API_KEY`
   - `_SUPABASE_URL`
   - `_SUPABASE_KEY`
   - `_JWT_SECRET`

4. Deploy:
```bash
gcloud builds submit --config=cloudbuild.yaml
```

## Project Structure

```
hackathon-spoonity/
├── backend/
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   ├── services/         # Business logic (PDF, Gemini)
│   │   ├── middleware/       # Auth middleware
│   │   ├── db.ts            # Database connection
│   │   ├── auth.ts          # Auth utilities
│   │   └── index.ts         # Express app
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── setup-database.sql
├── public/
│   ├── index.html           # Main frontend
│   ├── app.js              # Frontend logic
│   └── expense_overview.png
├── docker-compose.yml
├── cloudbuild.yaml
└── README.md
```

## Environment Variables

```env
# Google AI (Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Authentication
JWT_SECRET=your_secure_random_string

# Server
PORT=3000
NODE_ENV=development

# Maps Provider (optional)
# MAPS_PROVIDER=auto|google|leaflet
# - auto: use Google if GOOGLE_MAPS_API_KEY (or GOOGLE_API_KEY) is present, else Leaflet
# - google: force Google Maps JS API
# - leaflet: force Leaflet + OpenStreetMap (no key)
MAPS_PROVIDER=auto

# Google Maps JS key (only for the frontend map)
GOOGLE_MAPS_API_KEY=your_google_maps_js_key
```

## Security Notes

- JWT tokens expire after 7 days
- Passwords are hashed using bcrypt (10 rounds)
- CORS is enabled for development (configure for production)
- PDF files are stored as bytea in PostgreSQL
- All authenticated routes require valid JWT token

## Future Enhancements

- [ ] Email notifications when new documents arrive
- [ ] Export analysis to CSV/Excel
- [ ] Multi-month comparison charts
- [ ] Budget tracking and alerts
- [ ] Support for multiple file formats
- [ ] Mobile app
- [ ] Real-time WebSocket notifications

## License

MIT

## Support

For issues and questions, please open an issue on the GitHub repository.
