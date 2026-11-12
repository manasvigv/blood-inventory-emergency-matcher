# Report — Member B sections (draft)

> Draft for the project report. Each section maps to a rubric item. Replace `[Screenshot: …]` with real
> screenshots from the running app, and the introduction / architecture / conclusion are written jointly.

---

## B1. ER diagram, schema and DDL (Member B tables)

**Tables owned:** `hospital`, `patient`, `blood_request`, `issue`, `test_result`, `compatibility`, `emergency_reservation`, `emergency_reservation_item`, `users` (`db/20_b_core_tables.sql`).

Key decisions (full ER diagram in `docs/er-diagram.md`):

- **Hospital-Patient Requisition Hierarchy:** Hospitals submit requests against specific registered patients (`blood_request(hospital_id, patient_id, blood_group, family_code, units_requested, priority, status)`).
- **Physical Fulfillment Tracking:** Each issued unit is explicitly logged in `issue(request_id, unit_id, issued_at, notes)` with foreign keys to both `blood_request` and `blood_component`.
- **Clinical Compatibility as Data:** Physiological transfusion rules are represented in `compatibility(recipient_group, donor_group, component_code)` so allocation procedures never rely on simplistic string matching.
- **Atomic Emergency Bundle Structure:** `emergency_reservation` and `emergency_reservation_item` isolate multi-component trauma packs, allowing all-or-nothing reservations across multiple component types.
- **User Authentication & RBAC Schema:** `users(user_id, email, password_hash, role, full_name, hospital_id, donor_id)` maps logins directly to application and database roles.

[Screenshot: ER diagram showing Member B tables]

---

## B2. DML

Member B DML operations handle hospital requisitions, fulfillment allocations, emergency trauma reservations, laboratory test recording, and unit status transitions:
- `INSERT INTO blood_request`: Hospital submits routine, urgent, or emergency blood orders.
- `INSERT INTO issue` & `UPDATE blood_component SET status = 'issued'`: FEFO allocation marks units as issued and fulfills requests.
- `INSERT INTO emergency_reservation` & `emergency_reservation_item`: Atomic trauma pack reservations.
- `INSERT INTO test_result` & `UPDATE blood_component SET status = 'available'`: Laboratory clearance releasing quarantine stock into active inventory.
- Parameterised and transaction-safe execution is enforced in `src/app/api/requests/route.ts`, `src/app/api/emergency/route.ts`, and `src/app/api/lab/tests/route.ts`.

---

## B3. Trigger: Unit Lifecycle & Status Integrity

`trg_unit_status_check` (`BEFORE UPDATE ON blood_component`) enforces clinical release criteria with `SIGNAL SQLSTATE '45000'`:

| Constraint | Enforcement Rule | Clinical Safety Justification |
|---|---|---|
| **Laboratory Clearance** | Unit cannot become `available` unless `test_result.test_status = 'passed'` | Prevents untested blood from being allocated or issued. |
| **Expiry Gate** | Unit cannot become `available` if `expires_at <= NOW()` | Expired components can never be restored to active inventory. |
| **Terminal Status Locking** | Units marked `issued` or `discarded` cannot return to active stock | Protects against audit corruption and double transfusion. |

[Screenshot: Database error blocking untested unit from becoming available]

---

## B4. Stored Procedure: FEFO Allocation Engine

`sp_allocate_fefo(IN p_request_id INT)` executes inside an ACID transaction with an `EXIT HANDLER FOR SQLEXCEPTION … ROLLBACK; RESIGNAL`:
1. Fetches patient blood group, requested stock family, and unit quantity from `blood_request`.
2. Opens a cursor over `blood_component` joined against `compatibility` where `bc.status = 'available'` and `bc.expires_at > NOW()`.
3. Orders candidates strictly by **Earliest Expiry First** (`ORDER BY bc.expires_at ASC, bc.collected_at ASC, bc.unit_id ASC`).
4. Acquires row-level pessimistic locks using `FOR UPDATE` to prevent concurrent double-booking.
5. Updates units to `issued`, logs records in `issue`, and updates request status (`fulfilled` or `partially_fulfilled`).

[Screenshot: Requests page showing FEFO-allocated unit and fulfilled badge]

---

## B5. Stored Procedure: Atomic Emergency Transfusion Bundle

`sp_reserve_emergency_bundle(hospital_id, patient_id, blood_group, rbc_qty, plt_qty, ffp_qty, notes)`:
- Implements all-or-nothing trauma resuscitation packs (e.g., 2 RBC + 1 PLT + 1 FFP).
- Concurrently queries and locks compatible stock for Red Cells, Platelets, and Plasma.
- **Atomic Rollback on Shortage:** If even one component has insufficient stock, the procedure immediately calls `ROLLBACK`, releases all locks, and returns an explanatory message without reserving partial stock.

[Screenshot: Emergency bundle reservation with component breakdown]

---

## B6. Recursive CTE: Safety Recall Lineage Trace

`sp_trace_safety_recall(IN p_donation_id INT)` traverses the lineage DAG using a MySQL 8 `WITH RECURSIVE` Common Table Expression:
1. **Anchor Query:** Selects the root donation bag(s) where `donation_id = p_donation_id`.
2. **Recursive Member:** Joins `unit_lineage` to find all child units (red cells, platelets, plasma), grandchild aliquots (`sp_split_paediatric`), and platelet pools (`sp_pool_platelets`).
3. **Fulfillment Joins:** Joins each unit against `issue` $\to$ `blood_request` $\to$ `patient` $\to$ `hospital`.
4. Outputs the complete chain: in-stock units for immediate quarantine, and transfused units with patient name and hospital emergency contact details.

[Screenshot: Safety recall page listing traced units and transfused patient contacts]

---

## B7. NoSQL: Unit Audit Log (MongoDB)

- **`audit_log`** collection initialized with `$jsonSchema` validator and compound indexes (`scripts/mongo-init.mjs`):
  - `(unitId, timestamp)`: Fast unit-specific lifecycle retrieval.
  - `(eventType, timestamp)`: Efficient event-based timeline filtering.
  - `(timestamp)`: Global chronological activity queries.
- **Event Capture:** Automatically records `collected`, `tested`, `status_change`, `reserved`, `issued`, `recalled`, `discarded`, and `expired` events.
- **CRUD & API:** Implemented full REST endpoints (`GET`, `POST`, `PUT`, `DELETE`) with role-based validation in `src/app/api/audit/route.ts`.
- **UI:** Interactive timeline with real-time event filtering in `src/app/audit/page.tsx`.

[Screenshot: Unit audit timeline showing chronological events]

---

## B8. Authentication & RBAC — Application & Session Side

- **Password Security:** Passwords hashed with `bcrypt` (10 salt rounds) stored in `users`.
- **Signed Session Tokens:** High-performance JWT cookies generated and verified using `jose` with `HS256` and 8-hour expiration.
- **Dynamic Role Navigation:** Sidebar and client views dynamically render permitted tabs based on role permissions (`admin`, `lab`, `hospital`, `donor`).
- **Demo Quick-Login:** 1-click login profiles for rapid demonstration across all 4 roles.

---

## B9. Testing

`db/tests/b_hospital_testing_tests.sql` validates 5 core database scenarios:
1. Trigger blocks untested units from becoming available.
2. Trigger blocks expired units from becoming available.
3. `sp_allocate_fefo` issues units and fulfills requests via earliest expiry.
4. `sp_reserve_emergency_bundle` rolls back atomically on shortage.
5. `sp_trace_safety_recall` traverses multi-tier lineage trees.

Combined test suite status:
- Member A Tests: **54 / 54 PASSED**
- Member B Tests: **5 / 5 PASSED**
- Role Access Control Checks: **17 / 17 PASSED**
- ESLint: **0 errors, 0 warnings**
- Next.js Production Build: **All 35 routes compiled successfully**

[Screenshot: SQL test suite execution output showing all PASS]
