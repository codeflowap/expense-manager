# Quick Start Guide

## Prerequisites Setup

### 1. Install Supabase Database

1. Go to https://supabase.com and sign in
2. Create a new project or use your existing project
3. Go to **SQL Editor**
4. Copy and paste the contents of `backend/setup-database.sql`
5. Click **Run** to create all tables

### 2. Configure Environment Variables

The `.env` file in the `backend/` directory should already have your credentials. Verify:

```env
GOOGLE_API_KEY=AIzaSyBkq_jfdsFO4uKUZQJZqREMbtjDectSuIk
SUPABASE_URL=https://flopdemqtvokeszxjpwk.supabase.co
SUPABASE_KEY=<your-supabase-anon-key>
JWT_SECRET=f8c88307-6afb-46ff-8c48-b8c059348c41
PORT=3000
NODE_ENV=development
```

**Important:** Get your actual Supabase anon key from:
- Supabase Dashboard → Settings → API → `anon` `public` key

## Running the Application

### Development Mode

```bash
cd backend
npm run dev
```

The server will start on http://localhost:3000

Open your browser and navigate to http://localhost:3000

### Production Mode

```bash
cd backend
npm run build
npm start
```

## Using the Application

### 1. Register an Account

1. Open http://localhost:3000
2. Click **Register** button
3. Enter email and password
4. Click **Register**

### 2. Upload a PDF Statement

**Option A: Manual Upload**
1. Click or drag-and-drop a PDF file
2. Wait for upload confirmation
3. Click **Submit to Analyze**
4. Wait for AI analysis (may take 10-30 seconds)
5. View results

**Option B: Fetch from Gmail (simulated)**
1. Click **Fetch from Gmail & Analyze**
2. This will process the most recent unprocessed document in your inbox

### 3. Check Inbox

1. Click the inbox icon (📥) in the header
2. See all your uploaded documents
3. Click **Process** on pending documents
4. Click **Check Result** on processed documents

### 4. Pipedream Integration

To automatically process emails:

1. Create a Pipedream workflow at https://pipedream.com
2. Add Gmail trigger for emails with PDF attachments
3. Add HTTP request step:

```javascript
await $.send.http({
  method: 'POST',
  url: 'http://localhost:3000/api/webhook/pipedream',
  data: {
    user_email: 'your-registered-email@example.com',
    filename: steps.trigger.event.attachments[0].filename,
    pdf_base64: steps.trigger.event.attachments[0].data
  }
});
```

## Testing the API with cURL

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Upload PDF (save token from login response)
```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/your/statement.pdf"
```

### Get Inbox
```bash
curl http://localhost:3000/api/inbox \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Docker Deployment

### Build and Run

```bash
# From project root
docker-compose up --build
```

Access at http://localhost:3000

### Stop

```bash
docker-compose down
```

## Troubleshooting

### Database Connection Error

1. Verify Supabase URL and Key in `.env`
2. Check that tables were created successfully
3. Test connection in Supabase SQL Editor:
   ```sql
   SELECT * FROM users LIMIT 1;
   ```

### Gemini API Error

1. Verify `GOOGLE_API_KEY` in `.env`
2. Check API quota at https://makersuite.google.com/app/apikey
3. Ensure Gemini API is enabled for your project

### File Upload Error

1. Check file size (should be < 50MB)
2. Ensure file is PDF format
3. Check browser console for errors

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or change PORT in .env
PORT=3001
```

## Next Steps

1. ✅ Test with a real bank statement PDF
2. ✅ Set up Pipedream automation
3. ✅ Deploy to Google Cloud Run (see README.md)
4. ✅ Configure custom domain
5. ✅ Enable HTTPS

## Support

- Check [README.md](README.md) for full documentation
- Review [backend/setup-database.sql](backend/setup-database.sql) for database schema
- Inspect browser console for frontend errors
- Check backend logs for API errors
