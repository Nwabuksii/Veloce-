export interface BabcockProgramme {
  school: string;
  name: string;
}

export function getBabcockDepartmentNames(): string[] {
  return [...new Set(BABCOCK_PROGRAMMES.map((programme) => programme.name))];
}

export function getBabcockDepartmentsBySchool(school: string): string[] {
  return BABCOCK_PROGRAMMES.filter((programme) => programme.school === school)
    .map((programme) => programme.name);
}

export const BABCOCK_PROGRAMMES: BabcockProgramme[] = [
  { school: "School of Computing & Engineering Sciences", name: "Computer Science" },
  { school: "School of Computing & Engineering Sciences", name: "Software Engineering" },
  { school: "School of Computing & Engineering Sciences", name: "Information Technology / ICT" },
  { school: "School of Computing & Engineering Sciences", name: "Civil Engineering" },
  { school: "School of Computing & Engineering Sciences", name: "Computer Engineering" },
  { school: "School of Computing & Engineering Sciences", name: "Electrical & Electronics Engineering" },
  { school: "School of Computing & Engineering Sciences", name: "Mechanical Engineering" },

  { school: "Benjamin S. Carson (Snr.) School of Medicine & Basic Medical Sciences", name: "Medicine & Surgery (MBBS)" },
  { school: "Benjamin S. Carson (Snr.) School of Medicine & Basic Medical Sciences", name: "Anatomy" },
  { school: "Benjamin S. Carson (Snr.) School of Medicine & Basic Medical Sciences", name: "Physiology" },
  { school: "Benjamin S. Carson (Snr.) School of Medicine & Basic Medical Sciences", name: "Biochemistry" },

  { school: "School of Nursing Sciences & Public/Allied Health", name: "Nursing Science" },
  { school: "School of Nursing Sciences & Public/Allied Health", name: "Public Health Technology" },
  { school: "School of Nursing Sciences & Public/Allied Health", name: "Medical Laboratory Science" },
  { school: "School of Nursing Sciences & Public/Allied Health", name: "Nutrition & Dietetics" },
  { school: "School of Nursing Sciences & Public/Allied Health", name: "Information Resources Management" },

  { school: "School of Science & Technology", name: "Agriculture (Agricultural Economics/Extension, Crop/Soil Science, Animal Science)" },
  { school: "School of Science & Technology", name: "Biology / Microbiology" },
  { school: "School of Science & Technology", name: "Chemistry" },
  { school: "School of Science & Technology", name: "Mathematics" },
  { school: "School of Science & Technology", name: "Physics with Electronics" },
  { school: "School of Science & Technology", name: "Architecture" },
  { school: "School of Science & Technology", name: "Estate Management" },

  { school: "School of Management Sciences", name: "Accounting" },
  { school: "School of Management Sciences", name: "Finance / Banking & Finance" },
  { school: "School of Management Sciences", name: "Business Administration" },
  { school: "School of Management Sciences", name: "Marketing" },

  { school: "Veronica Adeleke School of Social Sciences", name: "Economics" },
  { school: "Veronica Adeleke School of Social Sciences", name: "Mass Communication" },
  { school: "Veronica Adeleke School of Social Sciences", name: "Political Science / International Law & Diplomacy" },
  { school: "Veronica Adeleke School of Social Sciences", name: "Public Administration" },
  { school: "Veronica Adeleke School of Social Sciences", name: "Social Work" },

  { school: "School of Education & Humanities", name: "English & Literary Studies / English Language" },
  { school: "School of Education & Humanities", name: "History & International Studies" },
  { school: "School of Education & Humanities", name: "French and International Relations" },
  { school: "School of Education & Humanities", name: "Christian Religious Studies" },
  { school: "School of Education & Humanities", name: "Music & Creative Arts" },
  { school: "School of Education & Humanities", name: "Business Education" },
  { school: "School of Education & Humanities", name: "Economics Education" },
  { school: "School of Education & Humanities", name: "Educational Administration & Planning" },
  { school: "School of Education & Humanities", name: "Guidance & Counselling" },
  { school: "School of Education & Humanities", name: "Teacher Education Science" },

  { school: "School of Law & Security Studies", name: "Law (LL.B)" },
  { school: "School of Law & Security Studies", name: "International Law & Security Studies" },
];
