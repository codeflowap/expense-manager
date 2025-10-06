# Prisma Setup Guide

The project has been converted to use **Prisma ORM** for type-safe database access instead of direct Supabase queries.

## What Changed

✅ **Replaced** Supabase client with Prisma Client
✅ **Type-safe** database queries with autocomplete
✅ **Better** developer experience with Prisma Studio
✅ **Transactions** support for atomic operations

## Setup Steps

### 1. Database Connection String

You need to get the correct database connection string from Supabase:

1. Go to https://supabase.com/dashboard
2. Select your project **"Hackathon-Oct-2025"**
3. Go to **Settings** → **Database**
4. Scroll to **Connection string** section
5. Select **"URI"** tab
6. Copy the connection string

It should look like:
```
postgresql://postgres.flopdemqtvokeszxjpwk:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

### 2. Update .env File

Replace `[YOUR-PASSWORD]` with your actual password (`Spoonity2025!`) but URL-encoded:
- `!` → `%21`
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`

Your `.env` should have:
```env
# Prisma Database Connection
DATABASE_URL="postgresql://postgres.flopdemqtvokeszxjpwk:Spoonity2025%21@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.flopdemqtvokeszxjpwk:Spoonity2025%21@db.flopdemqtvokeszxjpwk.supabase.co:5432/postgres"
```

### 3. Create Database Tables

You still need to create the tables using the SQL script:

1. Go to Supabase Dashboard → **SQL Editor**
2. Copy the contents of `backend/setup-database.sql`
3. Run the script

This creates:
- `users` table
- `documents` table
- `analysis_results` table
- Indexes and triggers

### 4. Generate Prisma Client

```bash
cd backend
npm run prisma:generate
```

This generates type-safe Prisma Client based on your schema.

### 5. Verify Connection

Optional - test if Prisma can connect:

```bash
npx prisma db pull
```

This should show your existing tables without errors.

### 6. Start Development Server

```bash
npm run dev
```

You should see:
```
✓ Database connected successfully
✓ Database tables accessible (0 users)
🚀 Server is running on http://localhost:3000
```

## Prisma Commands

We've added helpful npm scripts:

```bash
# Generate Prisma Client (do this after schema changes)
npm run prisma:generate

# Push schema changes to database (creates/updates tables)
npm run prisma:push

# Open Prisma Studio (visual database browser)
npm run prisma:studio

# Create a migration (for production)
npm run prisma:migrate
```

## Prisma Studio

Prisma Studio is a visual database browser:

```bash
npm run prisma:studio
```

Opens at http://localhost:5555

You can:
- Browse all tables
- View/edit data
- Run queries
- See relationships

## Code Changes

### Before (Supabase):
```typescript
const { data: user, error } = await supabase
  .from('users')
  .select('id, email')
  .eq('email', email)
  .single();

if (error || !user) {
  // handle error
}
```

### After (Prisma):
```typescript
const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true
  }
});

if (!user) {
  // handle error
}
```

## Benefits

1. **Type Safety**: Autocomplete for all queries
2. **Relationships**: Easy to query related data
3. **Transactions**: Atomic database operations
4. **Migrations**: Track schema changes over time
5. **Studio**: Visual database browser

## Troubleshooting

### Error: "Authentication failed"

Your DATABASE_URL is incorrect. Check:
1. Password is URL-encoded (! → %21)
2. Using correct connection pooler URL
3. Database credentials match Supabase settings

### Error: "Table does not exist"

You forgot to run the SQL setup script:
1. Go to Supabase SQL Editor
2. Run `backend/setup-database.sql`

### Error: "Prisma Client not generated"

Run:
```bash
npm run prisma:generate
```

### Column names don't match

Prisma uses camelCase, database uses snake_case.
We handle this with `@map()` in the schema:

```prisma
passwordHash String @map("password_hash")
```

## Schema File

The Prisma schema is in `backend/prisma/schema.prisma`:

```prisma
model User {
  id           String     @id @default(uuid()) @db.Uuid
  email        String     @unique
  passwordHash String     @map("password_hash")
  createdAt    DateTime   @default(now()) @map("created_at")
  documents    Document[]
  @@map("users")
}

model Document {
  id             String          @id @default(uuid())
  userId         String          @map("user_id")
  filename       String
  pdfData        Bytes           @map("pdf_data")
  source         String
  processed      Boolean         @default(false)
  receivedAt     DateTime        @default(now()) @map("received_at")
  processedAt    DateTime?       @map("processed_at")
  user           User            @relation(fields: [userId], references: [id])
  analysisResult AnalysisResult?
  @@map("documents")
}

model AnalysisResult {
  id              String   @id @default(uuid())
  documentId      String   @unique @map("document_id")
  llmResponseHtml String   @map("llm_response_html")
  createdAt       DateTime @default(now()) @map("created_at")
  document        Document @relation(fields: [documentId], references: [id])
  @@map("analysis_results")
}
```

## Next Steps

1. ✅ Setup database connection
2. ✅ Run SQL setup script
3. ✅ Generate Prisma Client
4. ✅ Start server and test

You're ready to go! 🚀
