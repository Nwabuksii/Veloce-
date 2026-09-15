-- CreateTable
CREATE TABLE "AdminSectionView" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSectionView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminSectionView_adminId_section_key" ON "AdminSectionView"("adminId", "section");

-- AddForeignKey
ALTER TABLE "AdminSectionView" ADD CONSTRAINT "AdminSectionView_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
