import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const bootstrapOnly = process.argv.includes('--bootstrap-only');
    const adminEmail    = process.env.ADMIN_EMAIL    ?? 'admin@dokonect.uz';
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@2024!';
    const adminPhone    = process.env.ADMIN_PHONE    ?? '+998900000000';

    if (bootstrapOnly) {
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || adminPassword.length < 16) {
            throw new Error('Admin bootstrap requires an email and a password of at least 16 characters');
        }

        const admin = await prisma.user.findFirst({ where: { OR: [{ email: adminEmail }, { phone: adminPhone }] } });
        if (admin) return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.upsert({
        where:  { phone: adminPhone },
        update: bootstrapOnly ? {} : { email: adminEmail, password: hashedPassword },
        create: {
            name:     'Admin',
            phone:    adminPhone,
            email:    adminEmail,
            password: hashedPassword,
            role:     'ADMIN',
            status:   'ACTIVE',
        },
    });

    console.log(`✅ Admin: ${adminEmail} / ${adminPhone}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
