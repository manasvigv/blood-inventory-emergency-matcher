import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import { rng, sqlDateTime } from "./util.mjs";

export const DEMO_PASSWORD = "LifeLineDemo2026!";

export async function seedHospitalActivity(conn) {
  const r = rng(42);
  const pwHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Seed Hospitals
  const hospitals = [
    ["City General Hospital", "560001", "12 MG Road, Bengaluru", "080-22220101", "citygen@lifeline.local"],
    ["Northside Medical Centre", "560024", "45 Hebbal Main Road, Bengaluru", "080-22220102", "northside@lifeline.local"],
    ["South City Care Hospital", "560078", "88 JP Nagar 2nd Phase, Bengaluru", "080-22220103", "southcare@lifeline.local"],
    ["Apollo Specialty Hospital", "560076", "154 BTM Layout, Bengaluru", "080-22220104", "apollo@lifeline.local"],
    ["Manipal Hospital", "560038", "98 HAL Airport Road, Indiranagar, Bengaluru", "080-22220105", "manipal@lifeline.local"]
  ];

  for (const h of hospitals) {
    await conn.query(
      `INSERT INTO hospital (name, pincode, address, phone, email)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE address = VALUES(address)`,
      h
    );
  }

  const [hospRows] = await conn.query("SELECT hospital_id, name FROM hospital ORDER BY hospital_id");
  const hospitalIds = hospRows.map(h => h.hospital_id);

  // 2. Seed Users
  const users = [
    ["admin@lifeline.local", pwHash, "admin", null],
    ["lab@lifeline.local", pwHash, "lab", null],
    ["hospital@lifeline.local", pwHash, "hospital", hospitalIds[0]],
    ["donor@lifeline.local", pwHash, "donor", null]
  ];

  for (const u of users) {
    await conn.query(
      `INSERT INTO users (email, password_hash, role, hospital_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      u
    );
  }

  const [userRows] = await conn.query("SELECT user_id, role FROM users");
  const labUser = userRows.find(u => u.role === "lab")?.user_id || 1;

  // 3. Seed Patients
  const firstNames = ["Aarav", "Diya", "Rohan", "Ananya", "Vikram", "Sneha", "Karan", "Pooja", "Arjun", "Meera", "Rahul", "Kavita", "Suresh", "Divya", "Gaurav"];
  const lastNames = ["Sharma", "Patel", "Reddy", "Rao", "Nair", "Iyer", "Kulkarni", "Hegde", "Bhat", "Deshmukh", "Verma", "Pai", "Gupta", "Menon"];
  const bloodGroups = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

  const patientRows = [];
  let pRef = 100;
  for (const hid of hospitalIds) {
    for (let i = 0; i < 6; i++) {
      const fn = r.pick(firstNames);
      const ln = r.pick(lastNames);
      const bg = r.pick(bloodGroups);
      const gender = r.pick(["M", "F"]);
      const birthYear = r.int(1955, 2015);
      const birthDate = `${birthYear}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`;
      patientRows.push([hid, `PAT-REF-${pRef++}`, `${fn} ${ln}`, gender, birthDate, bg]);
    }
  }

  for (const p of patientRows) {
    await conn.query(
      `INSERT INTO patient (hospital_id, hospital_patient_ref, full_name, gender, date_of_birth, blood_group)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
      p
    );
  }

  const [allPatients] = await conn.query("SELECT patient_id, hospital_id, blood_group FROM patient");

  // 4. Lab testing of recent donations
  const [untested] = await conn.query(`
    SELECT d.donation_id, d.donated_at
    FROM donation d
    LEFT JOIN test_result tr ON tr.donation_id = d.donation_id
    WHERE tr.test_id IS NULL
    ORDER BY d.donated_at DESC
  `);

  let passedTests = 0;
  let failedTests = 0;

  for (const d of untested) {
    // 95% pass rate
    const pass = r.chance(0.95);
    const testStatus = pass ? "passed" : "failed";
    const remarks = pass
      ? "All mandatory screening tests negative (HIV, HBV, HCV, Syphilis, Malaria)"
      : "Reactive on initial serology screening";

    await conn.query(
      `INSERT INTO test_result (donation_id, test_status, tested_by, tested_at, remarks)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE test_status = VALUES(test_status)`,
      [d.donation_id, testStatus, labUser, d.donated_at, remarks]
    );

    if (pass) passedTests++;
    else failedTests++;

    const newUnitStatus = pass ? "available" : "discarded";
    await conn.query(
      `UPDATE blood_component
       SET status = ?, status_changed_at = NOW()
       WHERE donation_id = ?
         AND status IN ('collected', 'testing')
         AND expires_at > NOW()`,
      [newUnitStatus, d.donation_id]
    );
  }

  // 5. Create Fresh Stock for Today so all components are well stocked (especially platelets)
  const now = new Date();
  const [activeDonors] = await conn.query(`
    SELECT d.donor_id, d.blood_group
    FROM donor d
    WHERE d.is_active = 1
      AND d.weight_kg >= 50
      AND TIMESTAMPDIFF(YEAR, d.date_of_birth, CURDATE()) BETWEEN 18 AND 60
      AND NOT EXISTS (
        SELECT 1 FROM donation dn
        WHERE dn.donor_id = d.donor_id
          AND dn.donated_at > NOW() - INTERVAL 120 DAY
      )
    LIMIT 50
  `);

  const countToCreate = Math.min(20, activeDonors.length);
  const [maxBag] = await conn.query("SELECT MAX(bag_number) AS mb FROM donation WHERE bag_number LIKE 'BB2026%' AND bag_number NOT LIKE 'BB20269%'");
  const baseNum = maxBag[0]?.mb ? Math.max(3000, parseInt(maxBag[0].mb.slice(6), 10) + 1) : 3000;

  for (let i = 0; i < countToCreate; i++) {
    const donor = activeDonors[i];
    const isApheresis = i % 3 === 0;
    const type = isApheresis ? "plateletpheresis" : "whole_blood";
    const bagNumber = `BB2026${String(baseNum + i).padStart(6, "0")}`;
    const donatedAt = sqlDateTime(new Date(now.getTime() - r.int(1, 48) * 3600 * 1000));

    const [dRes] = await conn.query(
      `INSERT INTO donation (donor_id, donation_type, bag_number, donated_at, volume_ml, hemoglobin_g_dl, platelet_count_k, weight_kg, collected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [donor.donor_id, type, bagNumber, donatedAt, isApheresis ? 300 : 450, 14.2, 220, 68.0, labUser]
    );

    const donationId = dRes.insertId;

    // Test result: PASS
    await conn.query(
      `INSERT INTO test_result (donation_id, test_status, tested_by, tested_at, remarks)
       VALUES (?, 'passed', ?, NOW(), 'Fresh donor screen negative')`,
      [donationId, labUser]
    );

    // Create components directly as AVAILABLE
    if (isApheresis) {
      // SDP Platelets (5 day shelf life)
      const expiresAt = sqlDateTime(new Date(now.getTime() + 4 * 86400 * 1000));
      await conn.query(
        `INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status, status_changed_at)
         VALUES (?, ?, 'SDP', ?, 250, ?, ?, 'available', NOW())`,
        [`${bagNumber}-SDP`, donationId, donor.blood_group, donatedAt, expiresAt]
      );
    } else {
      // RBC (42 days)
      const rbcExp = sqlDateTime(new Date(now.getTime() + 35 * 86400 * 1000));
      await conn.query(
        `INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status, status_changed_at)
         VALUES (?, ?, 'RBC', ?, 280, ?, ?, 'available', NOW())`,
        [`${bagNumber}-RBC`, donationId, donor.blood_group, donatedAt, rbcExp]
      );
      // FFP (365 days)
      const ffpExp = sqlDateTime(new Date(now.getTime() + 350 * 86400 * 1000));
      await conn.query(
        `INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status, status_changed_at)
         VALUES (?, ?, 'FFP', ?, 200, ?, ?, 'available', NOW())`,
        [`${bagNumber}-FFP`, donationId, donor.blood_group, donatedAt, ffpExp]
      );
      // PLT (5 days)
      const pltExp = sqlDateTime(new Date(now.getTime() + 4 * 86400 * 1000));
      await conn.query(
        `INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status, status_changed_at)
         VALUES (?, ?, 'PLT', ?, 50, ?, ?, 'available', NOW())`,
        [`${bagNumber}-PLT`, donationId, donor.blood_group, donatedAt, pltExp]
      );
    }
  }

  // 6. Simulate historical requests and FEFO allocation issues
  let requestsCreated = 0;
  let issuesCreated = 0;

  for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
    const reqDate = new Date(now.getTime() - dayOffset * 86400 * 1000);
    const reqCount = r.int(1, 3);

    for (let j = 0; j < reqCount; j++) {
      const patient = r.pick(allPatients);
      const family = r.pick(["RBC", "PLT", "FFP"]);
      const priority = r.weighted(["routine", "urgent", "emergency"], p => p === "routine" ? 7 : p === "urgent" ? 2 : 1);
      const units = r.int(1, 2);

      const [brRes] = await conn.query(
        `INSERT INTO blood_request (hospital_id, patient_id, blood_group, family_code, units_requested, priority, status, requested_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'Historical seed request')`,
        [patient.hospital_id, patient.patient_id, patient.blood_group, family, units, priority, sqlDateTime(reqDate)]
      );

      const reqId = brRes.insertId;
      requestsCreated++;

      // Allocate via sp_allocate_fefo
      try {
        const [allocRes] = await conn.query("CALL sp_allocate_fefo(?)", [reqId]);
        const alloc = allocRes[0]?.[0];
        if (alloc && alloc.allocated_units > 0) {
          issuesCreated += alloc.allocated_units;
        }
      } catch {
        // allocation attempt
      }
    }
  }

  // 7. Seed MongoDB Audit Log
  if (process.env.MONGODB_URI) {
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    try {
      await mongoClient.connect();
      const mongoDb = mongoClient.db(process.env.MONGODB_DB ?? "lifeline");
      const auditCol = mongoDb.collection("audit_log");

      const [sampleUnits] = await conn.query(`
        SELECT u.unit_id, u.unit_code, u.status, u.collected_at, i.issued_at
        FROM blood_component u
        LEFT JOIN issue i ON i.unit_id = u.unit_id
        WHERE u.status IN ('available', 'issued', 'reserved')
        LIMIT 100
      `);

      const auditDocs = [];
      for (const u of sampleUnits) {
        auditDocs.push({
          unitId: u.unit_id,
          unitCode: u.unit_code,
          eventType: "collected",
          actor: "system_intake",
          details: { status: "collected", volume_ml: 300 },
          timestamp: new Date(u.collected_at)
        });
        auditDocs.push({
          unitId: u.unit_id,
          unitCode: u.unit_code,
          eventType: "tested",
          actor: "lab_technician",
          details: { outcome: "passed", screen: "full_panel" },
          timestamp: new Date(new Date(u.collected_at).getTime() + 1800000)
        });
        auditDocs.push({
          unitId: u.unit_id,
          unitCode: u.unit_code,
          eventType: "status_change",
          actor: "lab_technician",
          details: { from: "testing", to: "available" },
          timestamp: new Date(new Date(u.collected_at).getTime() + 3600000)
        });

        if (u.status === "issued" && u.issued_at) {
          auditDocs.push({
            unitId: u.unit_id,
            unitCode: u.unit_code,
            eventType: "issued",
            actor: "hospital_coordinator",
            details: { status: "issued", method: "FEFO" },
            timestamp: new Date(u.issued_at)
          });
        }
      }

      if (auditDocs.length > 0) {
        await auditCol.insertMany(auditDocs);
        console.log(`  Seeded ${auditDocs.length} audit_log events in MongoDB.`);
      }
    } finally {
      await mongoClient.close();
    }
  }

  return {
    hospitals: hospitalIds.length,
    patients: allPatients.length,
    users: users.length,
    tests: passedTests + failedTests,
    requests: requestsCreated,
    issues: issuesCreated,
    pools: 0,
    aliquotSplits: 0
  };
}
