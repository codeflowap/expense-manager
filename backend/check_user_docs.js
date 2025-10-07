const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserDocuments() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'axeladri93@gmail.com' }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('');

    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { receivedAt: 'desc' }
    });

    console.log('Total documents:', documents.length);
    console.log('');

    documents.forEach((doc, i) => {
      console.log((i+1) + '. ' + doc.filename);
      console.log('   Processed:', doc.processed);
      console.log('   Source:', doc.source);
      console.log('   Received:', doc.receivedAt);
    });

    const unprocessed = documents.filter(d => !d.processed).length;
    console.log('\nUnprocessed:', unprocessed);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserDocuments();
