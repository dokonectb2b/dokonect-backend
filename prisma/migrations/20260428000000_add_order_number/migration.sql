-- Add orderNumber column
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" SERIAL NOT NULL;

-- Unique index
CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");

-- Mavjud orderlarni createdAt tartibida 1000dan boshlab qayta raqamlaymiz (faqat birinchi marta)
DO $$
DECLARE
  rec RECORD;
  counter INT := 1000;
BEGIN
  IF (SELECT COALESCE(MAX("orderNumber"), 0) FROM "Order") < 1000 THEN
    FOR rec IN SELECT id FROM "Order" ORDER BY "createdAt" ASC LOOP
      UPDATE "Order" SET "orderNumber" = counter WHERE id = rec.id;
      counter := counter + 1;
    END LOOP;
  END IF;
END $$;

-- Keyingi yangi orderlar mavjud eng katta raqamdan keyin ketsin (1000 dan kam bo'lmaydi)
SELECT setval(
  pg_get_serial_sequence('"Order"', 'orderNumber'),
  GREATEST(1000, (SELECT COALESCE(MAX("orderNumber"), 999) FROM "Order")),
  true
);
