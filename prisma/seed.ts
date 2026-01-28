// Seed script for demo tenants, users, roles, and default center data.
import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ParentRelationship,
  PrismaClient,
  StudentStatus,
  type Role,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Prisma 7 requires a driver adapter for Postgres in Node runtimes.
const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  // Seed inputs (defaults allow local dev without extra config).
  const demoTenantSlug = process.env.SEED_DEMO_TENANT_SLUG || "demo";
  const demoTenantName =
    process.env.SEED_DEMO_TENANT_NAME ||
    (demoTenantSlug === "demo" ? "Demo Tenant" : demoTenantSlug);
  const acmeTenantSlug = process.env.SEED_SECOND_TENANT_SLUG || "acme";
  const acmeTenantName =
    process.env.SEED_SECOND_TENANT_NAME ||
    (acmeTenantSlug === "acme" ? "Acme Tenant" : acmeTenantSlug);

  const demoOwnerEmail = process.env.SEED_OWNER_EMAIL || "owner@demo.local";
  const demoTutorEmail = process.env.SEED_TUTOR_EMAIL || "tutor@demo.local";
  const demoParentEmail = process.env.SEED_PARENT_EMAIL || "parent@demo.local";
  const acmeOwnerEmail =
    process.env.SEED_ACME_OWNER_EMAIL || "owner@acme.local";

  const demoOwnerName = (process.env.SEED_OWNER_NAME || "").trim() || undefined;
  const demoTutorName = (process.env.SEED_TUTOR_NAME || "").trim() || undefined;
  const demoParentName =
    (process.env.SEED_PARENT_NAME || "").trim() || undefined;
  const acmeOwnerName =
    (process.env.SEED_ACME_OWNER_NAME || "").trim() || undefined;

  const defaultPassword =
    process.env.SEED_DEFAULT_PASSWORD || process.env.SEED_OWNER_PASSWORD;

  // Fail fast if a default password is missing to avoid unusable accounts.
  if (!defaultPassword) {
    throw new Error(
      "SEED_DEFAULT_PASSWORD (or SEED_OWNER_PASSWORD) is required for seed",
    );
  }

  const demoOwnerPassword = process.env.SEED_OWNER_PASSWORD || defaultPassword;
  const demoTutorPassword = process.env.SEED_TUTOR_PASSWORD || defaultPassword;
  const demoParentPassword =
    process.env.SEED_PARENT_PASSWORD || defaultPassword;
  const acmeOwnerPassword =
    process.env.SEED_ACME_OWNER_PASSWORD || defaultPassword;

  async function upsertTenant(slug: string, name: string) {
    // Idempotent: upsert tenant by unique slug (safe to re-run locally).
    return prisma.tenant.upsert({
      where: { slug },
      update: { name },
      create: { slug, name },
    });
  }

  async function resolvePasswordHash(email: string, password: string) {
    // Reuse existing password hash if it already matches the env password.
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (
      existingUser?.passwordHash &&
      (await bcrypt.compare(password, existingUser.passwordHash))
    ) {
      return existingUser.passwordHash;
    }

    // Hash with bcrypt (10 rounds) only when needed.
    return bcrypt.hash(password, 10);
  }

  async function upsertUser(params: {
    email: string;
    password: string;
    name?: string;
  }) {
    const passwordHash = await resolvePasswordHash(
      params.email,
      params.password,
    );

    // Idempotent: upsert user by unique email for repeatable seeding.
    return prisma.user.upsert({
      where: { email: params.email },
      update: {
        passwordHash,
        ...(params.name ? { name: params.name } : {}),
      },
      create: {
        email: params.email,
        passwordHash,
        ...(params.name ? { name: params.name } : {}),
      },
    });
  }

  async function upsertCenter(params: {
    tenantId: string;
    name: string;
    timezone: string;
    isActive?: boolean;
  }) {
    // Idempotent: upsert centers by tenant + name for repeatable seeding.
    return prisma.center.upsert({
      where: {
        tenantId_name: {
          tenantId: params.tenantId,
          name: params.name,
        },
      },
      update: {
        timezone: params.timezone,
        isActive: params.isActive ?? true,
      },
      create: {
        tenantId: params.tenantId,
        name: params.name,
        timezone: params.timezone,
        isActive: params.isActive ?? true,
      },
    });
  }

  async function upsertSubject(params: {
    tenantId: string;
    name: string;
    isActive?: boolean;
  }) {
    // Idempotent: upsert subjects by tenant + name for repeatable seeding.
    return prisma.subject.upsert({
      where: {
        tenantId_name: {
          tenantId: params.tenantId,
          name: params.name,
        },
      },
      update: {
        isActive: params.isActive ?? true,
      },
      create: {
        tenantId: params.tenantId,
        name: params.name,
        isActive: params.isActive ?? true,
      },
    });
  }

  async function upsertLevel(params: {
    tenantId: string;
    name: string;
    sortOrder: number;
    isActive?: boolean;
  }) {
    // Idempotent: upsert levels by tenant + name for repeatable seeding.
    return prisma.level.upsert({
      where: {
        tenantId_name: {
          tenantId: params.tenantId,
          name: params.name,
        },
      },
      update: {
        sortOrder: params.sortOrder,
        isActive: params.isActive ?? true,
      },
      create: {
        tenantId: params.tenantId,
        name: params.name,
        sortOrder: params.sortOrder,
        isActive: params.isActive ?? true,
      },
    });
  }

  async function upsertProgram(params: {
    tenantId: string;
    name: string;
    subjectId?: string | null;
    levelId?: string | null;
    isActive?: boolean;
  }) {
    // Idempotent: upsert programs by tenant + name for repeatable seeding.
    return prisma.program.upsert({
      where: {
        tenantId_name: {
          tenantId: params.tenantId,
          name: params.name,
        },
      },
      update: {
        subjectId: params.subjectId ?? null,
        levelId: params.levelId ?? null,
        isActive: params.isActive ?? true,
      },
      create: {
        tenantId: params.tenantId,
        name: params.name,
        subjectId: params.subjectId ?? null,
        levelId: params.levelId ?? null,
        isActive: params.isActive ?? true,
      },
    });
  }

  async function upsertParent(params: {
    tenantId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    notes?: string;
  }) {
    // Parent emails are unique per tenant, so we can upsert safely.
    return prisma.parent.upsert({
      where: {
        tenantId_email: {
          tenantId: params.tenantId,
          email: params.email,
        },
      },
      update: {
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        notes: params.notes,
      },
      create: {
        tenantId: params.tenantId,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        phone: params.phone,
        notes: params.notes,
      },
    });
  }

  async function upsertStudent(params: {
    tenantId: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth?: Date;
    grade?: string;
    status?: StudentStatus;
    notes?: string;
  }) {
    // Students lack a natural unique field, so we upsert by name within tenant.
    const existing = await prisma.student.findFirst({
      where: {
        tenantId: params.tenantId,
        firstName: params.firstName,
        lastName: params.lastName,
      },
    });

    if (existing) {
      return prisma.student.update({
        where: { id: existing.id },
        data: {
          preferredName: params.preferredName,
          dateOfBirth: params.dateOfBirth,
          grade: params.grade,
          status: params.status,
          notes: params.notes,
        },
      });
    }

    return prisma.student.create({
      data: {
        tenantId: params.tenantId,
        firstName: params.firstName,
        lastName: params.lastName,
        preferredName: params.preferredName,
        dateOfBirth: params.dateOfBirth,
        grade: params.grade,
        status: params.status ?? StudentStatus.ACTIVE,
        notes: params.notes,
      },
    });
  }

  const demoTenant = await upsertTenant(demoTenantSlug, demoTenantName);
  const acmeTenant = await upsertTenant(acmeTenantSlug, acmeTenantName);
  // Extra tenants ensure at least five tenants in local sample data.
  const [northTenant, southTenant, westTenant] = await Promise.all([
    upsertTenant("north-campus", "North Campus"),
    upsertTenant("south-campus", "South Campus"),
    upsertTenant("west-campus", "West Campus"),
  ]);

  const demoOwner = await upsertUser({
    email: demoOwnerEmail,
    password: demoOwnerPassword,
    name: demoOwnerName,
  });
  const demoAdmin = await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL || "admin@demo.local",
    password: defaultPassword,
    name: "Demo Admin",
  });
  const demoTutor = await upsertUser({
    email: demoTutorEmail,
    password: demoTutorPassword,
    name: demoTutorName,
  });
  const demoTutorTwo = await upsertUser({
    email: process.env.SEED_TUTOR_TWO_EMAIL || "tutor2@demo.local",
    password: defaultPassword,
    name: "Demo Tutor Two",
  });
  const demoParent = await upsertUser({
    email: demoParentEmail,
    password: demoParentPassword,
    name: demoParentName,
  });
  const demoParentTwo = await upsertUser({
    email: process.env.SEED_PARENT_TWO_EMAIL || "parent2@demo.local",
    password: defaultPassword,
    name: "Demo Parent Two",
  });
  const acmeOwner = await upsertUser({
    email: acmeOwnerEmail,
    password: acmeOwnerPassword,
    name: acmeOwnerName,
  });
  const northOwner = await upsertUser({
    email: "owner@north.local",
    password: defaultPassword,
    name: "North Owner",
  });
  const southOwner = await upsertUser({
    email: "owner@south.local",
    password: defaultPassword,
    name: "South Owner",
  });
  const westOwner = await upsertUser({
    email: "owner@west.local",
    password: defaultPassword,
    name: "West Owner",
  });

  // Explicit Role typing keeps staff role filtering type-safe when adding new roles.
  const memberships: Array<{ tenantId: string; userId: string; role: Role }> = [
    { tenantId: demoTenant.id, userId: demoOwner.id, role: "Owner" as const },
    { tenantId: demoTenant.id, userId: demoAdmin.id, role: "Admin" as const },
    { tenantId: demoTenant.id, userId: demoTutor.id, role: "Tutor" as const },
    { tenantId: demoTenant.id, userId: demoTutorTwo.id, role: "Tutor" as const },
    { tenantId: demoTenant.id, userId: demoParent.id, role: "Parent" as const },
    {
      tenantId: demoTenant.id,
      userId: demoParentTwo.id,
      role: "Parent" as const,
    },
    { tenantId: acmeTenant.id, userId: acmeOwner.id, role: "Owner" as const },
    { tenantId: northTenant.id, userId: northOwner.id, role: "Owner" as const },
    { tenantId: southTenant.id, userId: southOwner.id, role: "Owner" as const },
    { tenantId: westTenant.id, userId: westOwner.id, role: "Owner" as const },
  ];

  // Idempotent: upsert memberships by (tenantId, userId) composite key.
  await Promise.all(
    memberships.map((membership) =>
      prisma.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId: membership.tenantId,
            userId: membership.userId,
          },
        },
        update: {
          role: membership.role,
        },
        create: membership,
      }),
    ),
  );

  // Idempotent: seed demo + extra tenant centers for local testing.
  const centerName = "Default Center";
  const centerTimezone = "America/Edmonton";

  const defaultCenter = await upsertCenter({
    tenantId: demoTenant.id,
    name: centerName,
    timezone: centerTimezone,
    isActive: true,
  });

  const demoCenters = await Promise.all([
    upsertCenter({
      tenantId: demoTenant.id,
      name: "Downtown Center",
      timezone: "America/Edmonton",
      isActive: true,
    }),
    upsertCenter({
      tenantId: demoTenant.id,
      name: "Uptown Center",
      timezone: "America/Edmonton",
      isActive: true,
    }),
    upsertCenter({
      tenantId: demoTenant.id,
      name: "East Center",
      timezone: "America/Edmonton",
      isActive: true,
    }),
    upsertCenter({
      tenantId: demoTenant.id,
      name: "West Center",
      timezone: "America/Edmonton",
      isActive: true,
    }),
  ]);

  await Promise.all([
    upsertCenter({
      tenantId: acmeTenant.id,
      name: "Acme Center",
      timezone: "America/New_York",
      isActive: true,
    }),
    upsertCenter({
      tenantId: northTenant.id,
      name: "North Center",
      timezone: "America/Chicago",
      isActive: true,
    }),
    upsertCenter({
      tenantId: southTenant.id,
      name: "South Center",
      timezone: "America/Chicago",
      isActive: true,
    }),
    upsertCenter({
      tenantId: westTenant.id,
      name: "West Center",
      timezone: "America/Los_Angeles",
      isActive: true,
    }),
  ]);

  // Seed a small academic catalog for the demo tenant only.
  const demoSubjects = await Promise.all([
    upsertSubject({
      tenantId: demoTenant.id,
      name: "Math",
      isActive: true,
    }),
    upsertSubject({
      tenantId: demoTenant.id,
      name: "English",
      isActive: true,
    }),
  ]);

  const demoLevels = await Promise.all([
    upsertLevel({
      tenantId: demoTenant.id,
      name: "Level 1",
      sortOrder: 1,
      isActive: true,
    }),
    upsertLevel({
      tenantId: demoTenant.id,
      name: "Level 2",
      sortOrder: 2,
      isActive: true,
    }),
  ]);

  const demoMath = demoSubjects.find((subject) => subject.name === "Math");
  const demoEnglish = demoSubjects.find((subject) => subject.name === "English");
  const demoLevel1 = demoLevels.find((level) => level.name === "Level 1");
  const demoLevel2 = demoLevels.find((level) => level.name === "Level 2");

  await Promise.all([
    upsertProgram({
      tenantId: demoTenant.id,
      name: "Algebra Basics",
      subjectId: demoMath?.id ?? null,
      levelId: demoLevel1?.id ?? null,
      isActive: true,
    }),
    upsertProgram({
      tenantId: demoTenant.id,
      name: "English Foundations",
      subjectId: demoEnglish?.id ?? null,
      levelId: demoLevel1?.id ?? null,
      isActive: true,
    }),
    upsertProgram({
      tenantId: demoTenant.id,
      name: "Advanced Writing",
      subjectId: demoEnglish?.id ?? null,
      levelId: demoLevel2?.id ?? null,
      isActive: true,
    }),
  ]);

  // Assign seeded staff roles (Owner/Admin/Tutor) to the default demo center.
  const staffMemberships = memberships.filter(
    (membership) =>
      membership.tenantId === demoTenant.id &&
      (membership.role === "Owner" ||
        membership.role === "Admin" ||
        membership.role === "Tutor"),
  );

  if (staffMemberships.length) {
    // Idempotent: link seeded staff users to the demo center when present.
    await prisma.staffCenter.createMany({
      data: staffMemberships.map((membership, index) => ({
        tenantId: membership.tenantId,
        userId: membership.userId,
        centerId:
          [defaultCenter, ...demoCenters][index % (demoCenters.length + 1)].id,
      })),
      skipDuplicates: true,
    });
  }

  // Seed student data for the demo tenant with at least five records.
  // Additional seeded students expand datasets for QA and reporting scenarios.
  const demoStudents = await Promise.all([
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Ava",
      lastName: "Johnson",
      preferredName: "Ava",
      dateOfBirth: new Date("2014-03-12"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Liam",
      lastName: "Chen",
      preferredName: "Liam",
      dateOfBirth: new Date("2013-11-02"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Mia",
      lastName: "Patel",
      preferredName: "Mia",
      dateOfBirth: new Date("2015-06-21"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Noah",
      lastName: "Garcia",
      preferredName: "Noah",
      dateOfBirth: new Date("2012-09-14"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Sophia",
      lastName: "Lopez",
      preferredName: "Sophie",
      dateOfBirth: new Date("2014-12-05"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Ethan",
      lastName: "Brown",
      preferredName: "Ethan",
      dateOfBirth: new Date("2013-02-18"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Olivia",
      lastName: "Davis",
      preferredName: "Olivia",
      dateOfBirth: new Date("2014-07-09"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Lucas",
      lastName: "Wilson",
      preferredName: "Luke",
      dateOfBirth: new Date("2012-10-30"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Amelia",
      lastName: "Martinez",
      preferredName: "Amelia",
      dateOfBirth: new Date("2015-04-04"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Mason",
      lastName: "Anderson",
      preferredName: "Mason",
      dateOfBirth: new Date("2013-09-22"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Harper",
      lastName: "Thomas",
      preferredName: "Harper",
      dateOfBirth: new Date("2014-01-15"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Logan",
      lastName: "Taylor",
      preferredName: "Logan",
      dateOfBirth: new Date("2012-08-11"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Evelyn",
      lastName: "Moore",
      preferredName: "Evelyn",
      dateOfBirth: new Date("2015-11-26"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Elijah",
      lastName: "Jackson",
      preferredName: "Eli",
      dateOfBirth: new Date("2013-05-06"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Abigail",
      lastName: "Martin",
      preferredName: "Abby",
      dateOfBirth: new Date("2014-02-27"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "James",
      lastName: "Lee",
      preferredName: "James",
      dateOfBirth: new Date("2012-12-03"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Emily",
      lastName: "Perez",
      preferredName: "Emily",
      dateOfBirth: new Date("2015-03-19"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Benjamin",
      lastName: "Thompson",
      preferredName: "Ben",
      dateOfBirth: new Date("2013-06-28"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Ella",
      lastName: "White",
      preferredName: "Ella",
      dateOfBirth: new Date("2014-09-01"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Henry",
      lastName: "Harris",
      preferredName: "Henry",
      dateOfBirth: new Date("2012-04-17"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Avery",
      lastName: "Sanchez",
      preferredName: "Avery",
      dateOfBirth: new Date("2015-08-13"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Jackson",
      lastName: "Clark",
      preferredName: "Jack",
      dateOfBirth: new Date("2013-01-29"),
      grade: "6",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Scarlett",
      lastName: "Ramirez",
      preferredName: "Scarlett",
      dateOfBirth: new Date("2014-05-23"),
      grade: "5",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Sebastian",
      lastName: "Lewis",
      preferredName: "Sebastian",
      dateOfBirth: new Date("2012-07-07"),
      grade: "7",
      status: StudentStatus.ACTIVE,
    }),
    upsertStudent({
      tenantId: demoTenant.id,
      firstName: "Grace",
      lastName: "Walker",
      preferredName: "Grace",
      dateOfBirth: new Date("2015-10-10"),
      grade: "4",
      status: StudentStatus.ACTIVE,
    }),
  ]);

  // Seed parent data for the demo tenant with at least five records.
  const demoParents = await Promise.all([
    upsertParent({
      tenantId: demoTenant.id,
      firstName: "Elena",
      lastName: "Johnson",
      email: "elena.johnson@demo.local",
      phone: "555-0101",
    }),
    upsertParent({
      tenantId: demoTenant.id,
      firstName: "Wei",
      lastName: "Chen",
      email: "wei.chen@demo.local",
      phone: "555-0102",
    }),
    upsertParent({
      tenantId: demoTenant.id,
      firstName: "Priya",
      lastName: "Patel",
      email: "priya.patel@demo.local",
      phone: "555-0103",
    }),
    upsertParent({
      tenantId: demoTenant.id,
      firstName: "Carlos",
      lastName: "Garcia",
      email: "carlos.garcia@demo.local",
      phone: "555-0104",
    }),
    upsertParent({
      tenantId: demoTenant.id,
      firstName: "Isabella",
      lastName: "Lopez",
      email: "isabella.lopez@demo.local",
      phone: "555-0105",
    }),
  ]);

  if (demoStudents.length && demoParents.length) {
    // Link students to parents to populate StudentParent relations.
    await prisma.studentParent.createMany({
      data: demoStudents.map((student, index) => ({
        tenantId: demoTenant.id,
        studentId: student.id,
        parentId: demoParents[index % demoParents.length].id,
        relationship: ParentRelationship.GUARDIAN,
      })),
      skipDuplicates: true,
    });
  }

  console.log(
    `Seeded tenants '${demoTenant.slug}' + '${acmeTenant.slug}', users, memberships, and center '${centerName}'.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
