# ⚠️ Important Setup Notes

## 1. Supabase API Key Configuration

**IMPORTANT:** The `SUPABASE_KEY` in `backend/.env` needs to be updated with your correct Supabase anon/public key.

### How to Get Your Supabase Key:

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to: **Settings** → **API**
3. Find the section labeled **Project API keys**
4. Copy the **`anon`** **`public`** key (NOT the service_role key!)
5. Replace the value of `SUPABASE_KEY` in `backend/.env`

The anon key should look like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsb3BkZW1xdHZva2VzenhqcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgyNDIzOTEsImV4cCI6MjA0MzgxODM5MX0.CORRECT_SIGNATURE_HERE
```

**DO NOT use the `service_role` key** as it has elevated permissions and should be kept secret!

## 2. Database Tables Setup

Before running the application, you MUST create the database tables:

1. Go to Supabase Dashboard → **SQL Editor**
2. Open the file `backend/setup-database.sql`
3. Copy all the SQL code
4. Paste it into the SQL Editor
5. Click **Run**

You should see:
- ✅ users table created
- ✅ documents table created
- ✅ analysis_results table created
- ✅ Indexes created
- ✅ Triggers created

### Verify Tables Were Created:

Run this query in SQL Editor:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('users', 'documents', 'analysis_results');
```

You should see all three table names returned.

## 3. Google Gemini API Key

Your current API key in the .env file:
```
GOOGLE_API_KEY=AIzaSyBkq_jfdsFO4uKUZQJZqREMbtjDectSuIk
```

Make sure this key:
- ✅ Is valid and active
- ✅ Has Gemini API enabled
- ✅ Has sufficient quota

Test your key at: https://makersuite.google.com/app/apikey

## 4. First Run Checklist

Before starting the server:

- [ ] Database tables created in Supabase
- [ ] Correct Supabase anon key in `backend/.env`
- [ ] Google API key is valid
- [ ] JWT_SECRET is set (can be any random string)
- [ ] Run `cd backend && npm install`
- [ ] Run `npm run build` to verify TypeScript compiles

## 5. Start the Server

```bash
cd backend
npm run dev
```

Expected output:
```
✓ Database tables exist and are accessible
🚀 Server is running on http://localhost:3000
📊 Health check: http://localhost:3000/health
```

## 6. Test the Setup

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

### Test 2: Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Should return:
```json
{"message":"User registered successfully","token":"...","user":{...}}
```

### Test 3: Open Frontend
Open http://localhost:3000 in your browser and you should see the login page.

## 7. Common Errors and Solutions

### Error: "Failed to fetch"
**Solution:** Make sure the backend server is running on port 3000

### Error: "Invalid or expired token"
**Solution:** Logout and login again to get a fresh JWT token

### Error: "User already exists"
**Solution:** Use a different email or check the users table in Supabase

### Error: "Failed to create user" or database errors
**Solution:**
1. Verify Supabase URL and KEY are correct
2. Check that tables were created successfully
3. Make sure you're using the `anon` key, not `service_role` key

### Error: "Failed to analyze statement with AI"
**Solution:**
1. Verify Google API key is correct
2. Check Gemini API quota
3. Ensure the PDF has extractable text (not just images)

## 8. Pipedream Setup (Optional)

To enable automated email processing:

1. Create a Pipedream account at https://pipedream.com
2. Create a new workflow
3. Add **Gmail** trigger: "New Labeled Email"
4. Add a filter step to only process emails with PDF attachments
5. Add a Node.js code step:

```javascript
export default defineComponent({
  async run({ steps, $ }) {
    // Find PDF attachment
    const attachment = steps.trigger.event.attachments.find(
      a => a.contentType === 'application/pdf'
    );

    if (!attachment) {
      return { error: 'No PDF found' };
    }

    // Send to backend
    const response = await $.send.http({
      method: 'POST',
      url: 'http://YOUR_SERVER_URL/api/webhook/pipedream',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        user_email: 'your-registered-email@example.com',
        filename: attachment.filename,
        pdf_base64: attachment.data.toString('base64')
      }
    });

    return response;
  }
});
```

6. Replace `YOUR_SERVER_URL` with your deployed URL (or use ngrok for local testing)
7. Replace `your-registered-email@example.com` with your actual registered email

## 9. Security Reminder

- **Never commit `.env` files to git** (already in .gitignore)
- **Keep your `service_role` key secret** - never expose it
- **Use strong passwords** for user accounts
- **Change JWT_SECRET** to a strong random string in production
- **Enable HTTPS** when deploying to production

## 10. Need Help?

1. Check the [README.md](README.md) for full documentation
2. Review [QUICKSTART.md](QUICKSTART.md) for step-by-step guide
3. Check [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for architecture overview
4. Inspect browser console (F12) for frontend errors
5. Check backend terminal logs for API errors
6. Verify database tables in Supabase SQL Editor

---

**Good luck with your hackathon!** 🚀
