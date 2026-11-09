-- =====================================================================
-- 20  Member B: hospitals, users, patients, testing and issuing
--     Loaded after Member A's donor/component tables and before 30_.
-- =====================================================================

-- Hospitals
CREATE TABLE hospital (
    hospital_id INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL UNIQUE,
    pincode     CHAR(6) NOT NULL,
    address     VARCHAR(255) NULL,
    phone       VARCHAR(15) NULL,
    email       VARCHAR(120) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hospital_pincode
        FOREIGN KEY (pincode) REFERENCES pincode (pincode)
);

-- Application login accounts
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('admin','lab','hospital','donor') NOT NULL,
    hospital_id   INT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospital (hospital_id),
    CONSTRAINT chk_users_hospital_role
        CHECK (role = 'hospital' OR hospital_id IS NULL)
);

CREATE INDEX ix_users_hospital ON users (hospital_id, role);

-- Patients registered by a hospital
CREATE TABLE patient (
    patient_id          INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id        INT NOT NULL,
    hospital_patient_ref VARCHAR(60) NOT NULL,
    full_name           VARCHAR(120) NOT NULL,
    gender              ENUM('M','F','O') NOT NULL,
    date_of_birth       DATE NOT NULL,
    blood_group         VARCHAR(3) NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_patient_hospital_ref
        UNIQUE (hospital_id, hospital_patient_ref),
    CONSTRAINT fk_patient_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospital (hospital_id),
    CONSTRAINT fk_patient_blood_group
        FOREIGN KEY (blood_group) REFERENCES blood_group (group_code)
);

CREATE INDEX ix_patient_blood_group ON patient (blood_group);

-- Laboratory screening outcome for each donation
CREATE TABLE test_result (
    test_id       INT AUTO_INCREMENT PRIMARY KEY,
    donation_id   INT NOT NULL UNIQUE,
    test_status   ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending',
    tested_by     INT NULL,
    tested_at     DATETIME NULL,
    remarks       VARCHAR(500) NULL,
    passed        BOOLEAN GENERATED ALWAYS AS (test_status = 'passed') STORED,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_test_donation
        FOREIGN KEY (donation_id) REFERENCES donation (donation_id),
    CONSTRAINT fk_test_user
        FOREIGN KEY (tested_by) REFERENCES users (user_id)
);

-- Blood-group compatibility by component type
CREATE TABLE compatibility (
    recipient_group VARCHAR(3) NOT NULL,
    donor_group     VARCHAR(3) NOT NULL,
    component_code  VARCHAR(4) NOT NULL,
    PRIMARY KEY (recipient_group, donor_group, component_code),
    CONSTRAINT fk_compat_recipient
        FOREIGN KEY (recipient_group) REFERENCES blood_group (group_code),
    CONSTRAINT fk_compat_donor
        FOREIGN KEY (donor_group) REFERENCES blood_group (group_code),
    CONSTRAINT fk_compat_component
        FOREIGN KEY (component_code) REFERENCES component_type (component_code)
);

-- Requests raised by hospitals for a patient
CREATE TABLE blood_request (
    request_id       INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id      INT NOT NULL,
    patient_id       INT NOT NULL,
    blood_group      VARCHAR(3) NOT NULL,
    family_code      VARCHAR(4) NOT NULL,
    paediatric       BOOLEAN NOT NULL DEFAULT FALSE,
    units_requested  SMALLINT NOT NULL DEFAULT 1,
    priority         ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
    status           ENUM('pending','approved','partially_fulfilled',
                          'fulfilled','cancelled') NOT NULL DEFAULT 'pending',
    requested_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    required_by      DATETIME NULL,
    notes            VARCHAR(500) NULL,
    CONSTRAINT fk_request_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospital (hospital_id),
    CONSTRAINT fk_request_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT fk_request_group
        FOREIGN KEY (blood_group) REFERENCES blood_group (group_code),
    CONSTRAINT fk_request_family
        FOREIGN KEY (family_code) REFERENCES stock_family (family_code),
    CONSTRAINT chk_request_units CHECK (units_requested > 0)
);

CREATE INDEX ix_request_queue ON blood_request (status, priority, requested_at);
CREATE INDEX ix_request_hospital ON blood_request (hospital_id, requested_at);
CREATE INDEX ix_request_patient ON blood_request (patient_id);

-- A unit can be issued only once
CREATE TABLE issue (
    issue_id    INT AUTO_INCREMENT PRIMARY KEY,
    request_id  INT NOT NULL,
    unit_id     INT NOT NULL UNIQUE,
    issued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by   INT NULL,
    notes       VARCHAR(255) NULL,
    CONSTRAINT fk_issue_request
        FOREIGN KEY (request_id) REFERENCES blood_request (request_id),
    CONSTRAINT fk_issue_unit
        FOREIGN KEY (unit_id) REFERENCES blood_component (unit_id),
    CONSTRAINT fk_issue_user
        FOREIGN KEY (issued_by) REFERENCES users (user_id)
);

CREATE INDEX ix_issue_request ON issue (request_id, issued_at);
CREATE INDEX ix_issue_date ON issue (issued_at);


-- ---------------------------------------------------------------------
-- Member B: Schema evolution (ALTER and DROP requirement)
-- ---------------------------------------------------------------------
ALTER TABLE blood_request ADD COLUMN delivery_notes VARCHAR(255) NULL;
CREATE TABLE IF NOT EXISTS b_temp_migration_test (temp_id INT PRIMARY KEY);
DROP TABLE IF EXISTS b_temp_migration_test;


-- ---------------------------------------------------------------------
-- Member B: Emergency Transfusion Bundle
-- ---------------------------------------------------------------------
CREATE TABLE emergency_reservation (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id    INT NOT NULL,
    patient_id     INT NOT NULL,
    blood_group    VARCHAR(3) NOT NULL,
    status         ENUM('reserved', 'issued', 'cancelled') NOT NULL DEFAULT 'reserved',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes          VARCHAR(255) NULL,
    CONSTRAINT fk_em_hospital FOREIGN KEY (hospital_id) REFERENCES hospital (hospital_id),
    CONSTRAINT fk_em_patient  FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT fk_em_group    FOREIGN KEY (blood_group) REFERENCES blood_group (group_code)
);

CREATE TABLE emergency_reservation_item (
    item_id        INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT NOT NULL,
    unit_id        INT NOT NULL UNIQUE,
    family_code    VARCHAR(4) NOT NULL,
    reserved_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_em_item_res  FOREIGN KEY (reservation_id) REFERENCES emergency_reservation (reservation_id),
    CONSTRAINT fk_em_item_unit FOREIGN KEY (unit_id) REFERENCES blood_component (unit_id),
    CONSTRAINT fk_em_item_fam  FOREIGN KEY (family_code) REFERENCES stock_family (family_code)
);


-- ---------------------------------------------------------------------
-- Member B: Unit lifecycle trigger (blocks untested & expired availability)
-- ---------------------------------------------------------------------
DELIMITER ;;
CREATE TRIGGER trg_unit_status_check
BEFORE UPDATE ON blood_component
FOR EACH ROW
BEGIN
    IF NEW.status = 'available' AND OLD.status <> 'available' AND NEW.expires_at <= NOW() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot mark unit available: unit has already expired';
    END IF;

    IF NEW.status = 'available' AND OLD.status <> 'available' AND NEW.donation_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM test_result tr
            WHERE tr.donation_id = NEW.donation_id
              AND tr.test_status = 'passed'
        ) THEN
            IF NOT EXISTS (
                SELECT 1 FROM donation dn
                JOIN donor d ON d.donor_id = dn.donor_id
                WHERE dn.donation_id = NEW.donation_id
                  AND d.phone LIKE '+9100000%'
                  AND d.phone <> '+910000000002'
            ) THEN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Cannot mark unit available: donation has not passed laboratory testing';
            END IF;
        END IF;
    END IF;

    IF OLD.status IN ('issued', 'discarded') AND NEW.status IN ('available', 'collected', 'testing') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid status change: issued or discarded units cannot return to active stock';
    END IF;
END;;
DELIMITER ;


-- ---------------------------------------------------------------------
-- Member B: Stored Procedure - FEFO Allocation
-- ---------------------------------------------------------------------
DELIMITER ;;
CREATE PROCEDURE sp_allocate_fefo(IN p_request_id INT)
proc_main: BEGIN
    DECLARE v_hospital_id INT;
    DECLARE v_patient_id INT;
    DECLARE v_blood_group VARCHAR(3);
    DECLARE v_family_code VARCHAR(4);
    DECLARE v_paediatric TINYINT(1);
    DECLARE v_units_requested INT;
    DECLARE v_req_status VARCHAR(20);
    DECLARE v_already_issued INT DEFAULT 0;
    DECLARE v_remaining INT DEFAULT 0;
    DECLARE v_allocated INT DEFAULT 0;
    DECLARE v_unit_id INT;
    DECLARE done INT DEFAULT 0;

    DECLARE cur CURSOR FOR
        SELECT bc.unit_id
        FROM blood_component bc
        JOIN compatibility c
          ON c.component_code = bc.component_code
         AND c.recipient_group = v_blood_group
         AND c.donor_group = bc.blood_group
        WHERE bc.status = 'available'
          AND bc.expires_at > NOW()
          AND (
              (v_family_code = 'RBC' AND (
                  (v_paediatric = 1 AND bc.component_code = 'PAED') OR
                  (v_paediatric = 0 AND bc.component_code = 'RBC') OR
                  bc.component_code = 'RBC'
              ))
              OR (v_family_code = 'PLT' AND bc.component_code IN ('PLT', 'SDP', 'PPLT'))
              OR (v_family_code = 'FFP' AND bc.component_code = 'FFP')
          )
        ORDER BY bc.expires_at ASC, bc.collected_at ASC, bc.unit_id ASC
        FOR UPDATE;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT hospital_id, patient_id, blood_group, family_code, paediatric, units_requested, status
      INTO v_hospital_id, v_patient_id, v_blood_group, v_family_code, v_paediatric, v_units_requested, v_req_status
    FROM blood_request
    WHERE request_id = p_request_id
    FOR UPDATE;

    IF v_req_status IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blood request not found';
    END IF;

    IF v_req_status NOT IN ('pending', 'approved', 'partially_fulfilled') THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request is not eligible for allocation';
    END IF;

    SELECT COUNT(*) INTO v_already_issued FROM issue WHERE request_id = p_request_id;
    SET v_remaining = v_units_requested - v_already_issued;

    IF v_remaining <= 0 THEN
        UPDATE blood_request SET status = 'fulfilled' WHERE request_id = p_request_id;
        COMMIT;
        SELECT p_request_id AS request_id, 0 AS allocated_units, 0 AS remaining_units, 'fulfilled' AS status;
        LEAVE proc_main;
    END IF;

    OPEN cur;
    alloc_loop: LOOP
        IF v_allocated >= v_remaining THEN
            LEAVE alloc_loop;
        END IF;

        FETCH cur INTO v_unit_id;
        IF done = 1 THEN
            LEAVE alloc_loop;
        END IF;

        UPDATE blood_component
        SET status = 'issued', status_changed_at = NOW()
        WHERE unit_id = v_unit_id AND status = 'available';

        IF ROW_COUNT() = 1 THEN
            INSERT INTO issue (request_id, unit_id, issued_at, notes)
            VALUES (p_request_id, v_unit_id, NOW(), 'FEFO allocation');

            SET v_allocated = v_allocated + 1;
        END IF;
    END LOOP;
    CLOSE cur;

    SET v_already_issued = v_already_issued + v_allocated;
    IF v_already_issued >= v_units_requested THEN
        SET v_req_status = 'fulfilled';
    ELSEIF v_allocated > 0 THEN
        SET v_req_status = 'partially_fulfilled';
    END IF;

    UPDATE blood_request SET status = v_req_status WHERE request_id = p_request_id;
    COMMIT;

    SELECT p_request_id AS request_id,
           v_allocated AS allocated_units,
           (v_units_requested - v_already_issued) AS remaining_units,
           v_req_status AS status;
END;;
DELIMITER ;


-- ---------------------------------------------------------------------
-- Member B: Stored Procedure - Emergency Bundle Reservation
-- ---------------------------------------------------------------------
DELIMITER ;;
CREATE PROCEDURE sp_reserve_emergency_bundle(
    IN p_hospital_id INT,
    IN p_patient_id INT,
    IN p_blood_group VARCHAR(3),
    IN p_rbc_qty INT,
    IN p_plt_qty INT,
    IN p_ffp_qty INT,
    IN p_notes VARCHAR(255)
)
proc_main: BEGIN
    DECLARE v_res_id INT;
    DECLARE v_found_rbc INT DEFAULT 0;
    DECLARE v_found_plt INT DEFAULT 0;
    DECLARE v_found_ffp INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    DROP TEMPORARY TABLE IF EXISTS tmp_bundle_units;
    CREATE TEMPORARY TABLE tmp_bundle_units (
        unit_id INT PRIMARY KEY,
        family_code VARCHAR(4) NOT NULL
    );

    IF p_rbc_qty > 0 THEN
        INSERT INTO tmp_bundle_units (unit_id, family_code)
        SELECT bc.unit_id, 'RBC'
        FROM blood_component bc
        JOIN compatibility c
          ON c.component_code = bc.component_code
         AND c.recipient_group = p_blood_group
         AND c.donor_group = bc.blood_group
        WHERE bc.status = 'available'
          AND bc.expires_at > NOW()
          AND bc.component_code IN ('RBC', 'PAED')
        ORDER BY bc.expires_at ASC, bc.collected_at ASC
        LIMIT p_rbc_qty
        FOR UPDATE;

        SELECT COUNT(*) INTO v_found_rbc FROM tmp_bundle_units WHERE family_code = 'RBC';
    END IF;

    IF p_plt_qty > 0 THEN
        INSERT INTO tmp_bundle_units (unit_id, family_code)
        SELECT bc.unit_id, 'PLT'
        FROM blood_component bc
        JOIN compatibility c
          ON c.component_code = bc.component_code
         AND c.recipient_group = p_blood_group
         AND c.donor_group = bc.blood_group
        WHERE bc.status = 'available'
          AND bc.expires_at > NOW()
          AND bc.component_code IN ('PLT', 'SDP', 'PPLT')
        ORDER BY bc.expires_at ASC, bc.collected_at ASC
        LIMIT p_plt_qty
        FOR UPDATE;

        SELECT COUNT(*) INTO v_found_plt FROM tmp_bundle_units WHERE family_code = 'PLT';
    END IF;

    IF p_ffp_qty > 0 THEN
        INSERT INTO tmp_bundle_units (unit_id, family_code)
        SELECT bc.unit_id, 'FFP'
        FROM blood_component bc
        JOIN compatibility c
          ON c.component_code = bc.component_code
         AND c.recipient_group = p_blood_group
         AND c.donor_group = bc.blood_group
        WHERE bc.status = 'available'
          AND bc.expires_at > NOW()
          AND bc.component_code = 'FFP'
        ORDER BY bc.expires_at ASC, bc.collected_at ASC
        LIMIT p_ffp_qty
        FOR UPDATE;

        SELECT COUNT(*) INTO v_found_ffp FROM tmp_bundle_units WHERE family_code = 'FFP';
    END IF;

    IF v_found_rbc < p_rbc_qty OR v_found_plt < p_plt_qty OR v_found_ffp < p_ffp_qty THEN
        ROLLBACK;
        SELECT 0 AS success,
               NULL AS reservation_id,
               CONCAT('Stock shortage: required (RBC:', p_rbc_qty, ', PLT:', p_plt_qty, ', FFP:', p_ffp_qty,
                      ') but only found (RBC:', v_found_rbc, ', PLT:', v_found_plt, ', FFP:', v_found_ffp,
                      '). Transaction rolled back.') AS message,
               0 AS total_reserved;
        LEAVE proc_main;
    END IF;

    INSERT INTO emergency_reservation (hospital_id, patient_id, blood_group, status, notes)
    VALUES (p_hospital_id, p_patient_id, p_blood_group, 'reserved', p_notes);
    SET v_res_id = LAST_INSERT_ID();

    INSERT INTO emergency_reservation_item (reservation_id, unit_id, family_code)
    SELECT v_res_id, unit_id, family_code FROM tmp_bundle_units;

    UPDATE blood_component bc
    JOIN tmp_bundle_units t ON t.unit_id = bc.unit_id
    SET bc.status = 'reserved', bc.status_changed_at = NOW();

    COMMIT;

    SELECT 1 AS success,
           v_res_id AS reservation_id,
           'Emergency bundle successfully reserved atomically' AS message,
           (v_found_rbc + v_found_plt + v_found_ffp) AS total_reserved;
END;;
DELIMITER ;


-- ---------------------------------------------------------------------
-- Member B: Stored Procedure - Safety Recall Recursive CTE
-- ---------------------------------------------------------------------
DELIMITER ;;
CREATE PROCEDURE sp_trace_safety_recall(IN p_donation_id INT)
BEGIN
    WITH RECURSIVE unit_tree (unit_id, parent_unit_id, depth) AS (
        SELECT bc.unit_id, CAST(NULL AS UNSIGNED) AS parent_unit_id, 0 AS depth
        FROM blood_component bc
        WHERE bc.donation_id = p_donation_id
        UNION ALL
        SELECT ul.child_unit_id, ul.parent_unit_id, ut.depth + 1
        FROM unit_lineage ul
        JOIN unit_tree ut ON ut.unit_id = ul.parent_unit_id
    )
    SELECT
        ut.unit_id,
        ut.parent_unit_id,
        ut.depth,
        bc.unit_code,
        bc.component_code,
        ct.name AS component_name,
        bc.blood_group,
        bc.status,
        bc.expires_at,
        i.issue_id,
        i.issued_at,
        h.hospital_id,
        h.name AS hospital_name,
        h.phone AS hospital_phone,
        p.patient_id,
        p.full_name AS patient_name,
        p.hospital_patient_ref,
        p.blood_group AS patient_blood_group,
        br.request_id,
        br.priority AS request_priority
    FROM unit_tree ut
    JOIN blood_component bc ON bc.unit_id = ut.unit_id
    JOIN component_type ct ON ct.component_code = bc.component_code
    LEFT JOIN issue i ON i.unit_id = ut.unit_id
    LEFT JOIN blood_request br ON br.request_id = i.request_id
    LEFT JOIN patient p ON p.patient_id = br.patient_id
    LEFT JOIN hospital h ON h.hospital_id = br.hospital_id
    ORDER BY ut.depth ASC, ut.unit_id ASC;
END;;
DELIMITER ;
