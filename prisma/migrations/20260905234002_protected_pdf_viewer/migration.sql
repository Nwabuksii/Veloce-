-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "pageCount" INTEGER;

-- CreateTable
CREATE TABLE "NotePageImage" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "pageNum" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotePageImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotePageImage_noteId_pageNum_key" ON "NotePageImage"("noteId", "pageNum");

-- AddForeignKey
ALTER TABLE "NotePageImage" ADD CONSTRAINT "NotePageImage_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
