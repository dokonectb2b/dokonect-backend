import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Hash password: 123456
    const hashedPassword = await bcrypt.hash('123456', 10);

    // 1. Admin - +998900000000
    const admin = await prisma.user.upsert({
        where: { phone: '+998900000000' },
        update: {},
        create: {
            name: 'Admin',
            phone: '+998900000000',
            email: 'admin@dokonect.uz',
            password: hashedPassword,
            role: 'ADMIN',
            status: 'ACTIVE',
        },
    });
    console.log('✅ Admin created:', admin.phone);

    // 2. Distributor - +998901234567
    const distributor = await prisma.user.upsert({
        where: { phone: '+998901234567' },
        update: {},
        create: {
            name: 'Distribyutor Test',
            phone: '+998901234567',
            email: 'distributor@test.uz',
            password: hashedPassword,
            role: 'DISTRIBUTOR',
            status: 'ACTIVE',
        },
    });

    const distributorProfile = await prisma.distributor.upsert({
        where: { userId: distributor.id },
        update: {},
        create: {
            userId: distributor.id,
            companyName: 'Test Distribyutor',
            address: 'Toshkent, Chilonzor',
            isVerified: true,
        },
    });
    console.log('✅ Distributor created:', distributor.phone);

    // 2.1 Warehouse yaratish
    const warehouse = await prisma.warehouse.upsert({
        where: { id: 'default-warehouse-id' },
        update: {},
        create: {
            id: 'default-warehouse-id',
            distributorId: distributorProfile.id,
            name: 'Asosiy ombor',
            address: 'Toshkent, Chilonzor tumani',
            region: 'Toshkent',
            isActive: true,
        },
    });
    console.log('✅ Warehouse created:', warehouse.name);

    // 2.2 Kategoriyalar yaratish
    const categories = [
        { id: 'cat-ichimliklar', name: 'Ichimliklar', slug: 'ichimliklar' },
        { id: 'cat-oziq-ovqat', name: 'Oziq-ovqat', slug: 'oziq-ovqat' },
        { id: 'cat-shirinliklar', name: 'Shirinliklar', slug: 'shirinliklar' },
        { id: 'cat-sut-mahsulotlari', name: 'Sut mahsulotlari', slug: 'sut-mahsulotlari' },
        { id: 'cat-meva-sabzavot', name: 'Meva va sabzavot', slug: 'meva-sabzavot' },
    ];

    for (const cat of categories) {
        const existing = await prisma.category.findUnique({
            where: {
                distributorId_slug: {
                    distributorId: distributorProfile.id,
                    slug: cat.slug,
                },
            },
        });

        if (!existing) {
            await prisma.category.create({
                data: {
                    id: cat.id,
                    distributorId: distributorProfile.id,
                    name: cat.name,
                    slug: cat.slug,
                },
            });
            console.log(`✅ Category created: ${cat.name}`);
        } else {
            console.log(`⏭️  Category exists: ${cat.name}`);
        }
    }

    const category = categories[0]; // Ichimliklar kategoriyasi

    // 3. Client (Do'kon egasi) - +998901234500
    const client = await prisma.user.upsert({
        where: { phone: '+998901234500' },
        update: {},
        create: {
            name: "Do'kon Egasi",
            phone: '+998901234500',
            email: 'client@test.uz',
            password: hashedPassword,
            role: 'CLIENT',
            status: 'ACTIVE',
        },
    });

    await prisma.client.upsert({
        where: { userId: client.id },
        update: {},
        create: {
            userId: client.id,
            storeName: 'Test Do\'kon',
            region: 'Toshkent',
        },
    });
    console.log('✅ Client (Do\'kon egasi) created:', client.phone);

    // 4. Driver (Haydovchi) - +998901234599
    const driver = await prisma.user.upsert({
        where: { phone: '+998901234599' },
        update: {},
        create: {
            name: 'Haydovchi Test',
            phone: '+998901234599',
            email: 'driver@test.uz',
            password: hashedPassword,
            role: 'DRIVER',
            status: 'ACTIVE',
        },
    });

    await prisma.driver.upsert({
        where: { userId: driver.id },
        update: {},
        create: {
            userId: driver.id,
            vehicleType: 'Yengil avtomobil',
            vehicleNumber: '01A123BC',
            licenseNumber: 'AB1234567',
            rating: 5.0,
            isOnline: true,
        },
    });
    console.log('✅ Driver (Haydovchi) created:', driver.phone);

    console.log('🎉 Seeding completed!');
    console.log('\n📋 Test hisoblar:');
    console.log('  Admin:        +998900000000 / 123456');
    console.log('  Distribyutor: +998901234567 / 123456');
    console.log('  Do\'kon egasi: +998901234500 / 123456');
    console.log('  Haydovchi:    +998901234599 / 123456');
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
