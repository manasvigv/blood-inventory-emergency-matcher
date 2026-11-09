import { ownerConnection } from "./util.mjs";
import { seedHospitalActivity, DEMO_PASSWORD } from "./b-hospital-activity.mjs";

const conn = await ownerConnection();
try {
  console.log("Running Member B activity seeding...");
  const b = await seedHospitalActivity(conn);
  console.log(`Member B Seed Complete:
  - Hospitals: ${b.hospitals}
  - Patients: ${b.patients}
  - Users: ${b.users}
  - Lab Tests: ${b.tests}
  - Requests: ${b.requests}
  - Issues (Allocated): ${b.issues}
  Demo password for logins: ${DEMO_PASSWORD}`);
} finally {
  await conn.end();
}
