import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // These are the public sample accounts shown on the landing page.
    const password = await bcrypt.hash('123456', 10);

    await prisma.$transaction(async (tx) => {
        await tx.user.upsert({
            where: { phone: '+998901234567' },
            update: {},
            create: {
                phone: '+998901234567',
                name: 'Demo distribyutor',
                role: 'DISTRIBUTOR',
                password,
                distributor: {
                    create: {
                        companyName: 'Demo distribyutor',
                        address: 'Toshkent',
                    },
                },
            },
        });
        await tx.user.upsert({
            where: { phone: '+998901234500' },
            update: {},
            create: {
                phone: '+998901234500',
                name: 'Demo do‘kon egasi',
                role: 'CLIENT',
                password,
                client: { create: { storeName: 'Demo do‘kon' } },
            },
        });
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
