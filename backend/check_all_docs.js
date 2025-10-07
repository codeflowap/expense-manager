const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllDocuments() {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { receivedAt: 'desc' },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    });

    console.log('Total documents in database:', documents.length);
    console.log('');

    documents.forEach((doc, i) => {
      console.log((i+1) + '. ' + doc.filename);
      console.log('   ID:', doc.id);
      console.log('   User Email:', doc.user.email);
      console.log('   Source:', doc.source);
      console.log('   Processed:', doc.processed);
      console.log('   Received:', doc.receivedAt);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllDocuments();
