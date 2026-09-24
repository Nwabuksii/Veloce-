import { describe, expect, it } from "vitest";
import { BABCOCK_PROGRAMMES, getBabcockDepartmentsBySchool, getBabcockDepartmentNames } from "./babcock-programmes";

describe("Babcock academic programmes", () => {
  it("contains the required Babcock course list", () => {
    const names = BABCOCK_PROGRAMMES.map((p) => p.name);

    expect(names).toContain("Computer Science");
    expect(names).toContain("Medicine & Surgery (MBBS)");
    expect(names).toContain("Law (LL.B)");
    expect(names).toContain("Accounting");
    expect(names).toContain("Economics");
    expect(names).toContain("Teacher Education Science");
  });

  it("includes the expected academic groupings", () => {
    const schools = new Set(BABCOCK_PROGRAMMES.map((p) => p.school));

    expect(schools).toContain("School of Computing & Engineering Sciences");
    expect(schools).toContain("Benjamin S. Carson (Snr.) School of Medicine & Basic Medical Sciences");
    expect(schools).toContain("School of Law & Security Studies");
  });

  it("exposes department names and school groupings for campus seeding and filters", () => {
    expect(getBabcockDepartmentNames()).toContain("Computer Science");
    expect(getBabcockDepartmentNames()).toContain("Medicine & Surgery (MBBS)");
    expect(getBabcockDepartmentNames()).toHaveLength(new Set(BABCOCK_PROGRAMMES.map((p) => p.name)).size);

    expect(getBabcockDepartmentsBySchool("School of Computing & Engineering Sciences")).toContain("Computer Science");
    expect(getBabcockDepartmentsBySchool("School of Computing & Engineering Sciences")).toContain("Software Engineering");
  });
});
