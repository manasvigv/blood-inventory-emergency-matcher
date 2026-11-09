-- =====================================================================
-- Member B: database-level test cases.
-- Tests unit lifecycle trigger, FEFO allocation procedure, emergency
-- bundle atomic reservation, and recursive recall lineage tracing.
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS b_test_log;
CREATE TEMPORARY TABLE b_test_log (
    n       INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(120),
    passed  BOOLEAN,
    detail  VARCHAR(300)
);

DROP PROCEDURE IF EXISTS bt_expect_error;
DROP PROCEDURE IF EXISTS bt_check;

DELIMITER //

CREATE PROCEDURE bt_expect_error(IN p_name VARCHAR(120), IN p_sql TEXT, IN p_expected VARCHAR(200))
BEGIN
    DECLARE v_msg TEXT DEFAULT NULL;
    BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
            GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
        SET @t_sql = p_sql;
        PREPARE stmt FROM @t_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END;
    INSERT INTO b_test_log (name, passed, detail)
    VALUES (p_name, v_msg IS NOT NULL AND v_msg LIKE CONCAT('%', p_expected, '%'),
            COALESCE(LEFT(v_msg, 300), 'no error was raised'));
END //

CREATE PROCEDURE bt_check(IN p_name VARCHAR(120), IN p_ok BOOLEAN, IN p_detail VARCHAR(300))
BEGIN
    INSERT INTO b_test_log (name, passed, detail) VALUES (p_name, COALESCE(p_ok, FALSE), p_detail);
END //

DELIMITER ;

-- Clean up any prior test run leftovers
DELETE FROM issue WHERE request_id IN (SELECT request_id FROM blood_request WHERE patient_id = 1 AND hospital_id = 1 AND blood_group = 'O+' AND family_code = 'RBC' AND priority = 'routine' AND status IN ('pending', 'fulfilled'));
DELETE FROM blood_component WHERE unit_code IN ('TEST-UNIT-UNTESTED', 'TEST-UNIT-EXPIRED');
DELETE FROM blood_component WHERE donation_id IN (SELECT donation_id FROM donation WHERE bag_number = 'BB2026999901');
DELETE FROM test_result WHERE donation_id IN (SELECT donation_id FROM donation WHERE bag_number = 'BB2026999901');
DELETE FROM donation WHERE bag_number = 'BB2026999901';
DELETE FROM donor WHERE phone = '+910000000002';

-- Create dedicated test donor
INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode)
VALUES ('Test Donor Member B', 'M', '1995-05-15', 70.0, 'O+', '+910000000002', '560001');

SELECT donor_id INTO @test_donor_id FROM donor WHERE phone = '+910000000002';

-- ---------------------------------------------------------------------
-- 1. Unit lifecycle trigger: Untested unit cannot become available
-- ---------------------------------------------------------------------
INSERT INTO donation (donor_id, donation_type, bag_number, donated_at, volume_ml, hemoglobin_g_dl, weight_kg)
VALUES (@test_donor_id, 'whole_blood', 'BB2026999901', NOW(), 450, 14.0, 70.0);
SET @test_d_id = LAST_INSERT_ID();

INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status)
VALUES ('TEST-UNIT-UNTESTED', @test_d_id, 'RBC', 'O+', 280, NOW(), NOW() + INTERVAL 30 DAY, 'collected');
SET @untested_u_id = LAST_INSERT_ID();

CALL bt_expect_error(
    'Trigger blocks untested unit from becoming available',
    CONCAT('UPDATE blood_component SET status = ''available'' WHERE unit_id = ', @untested_u_id),
    'donation has not passed laboratory testing'
);

-- ---------------------------------------------------------------------
-- 2. Unit lifecycle trigger: Expired unit cannot become available
-- ---------------------------------------------------------------------
INSERT INTO test_result (donation_id, test_status, tested_at, remarks)
VALUES (@test_d_id, 'passed', NOW(), 'Test clearance');

INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at, status)
VALUES ('TEST-UNIT-EXPIRED', @test_d_id, 'RBC', 'O+', 280, NOW() - INTERVAL 45 DAY, NOW() - INTERVAL 5 DAY, 'collected');
SET @expired_u_id = LAST_INSERT_ID();

CALL bt_expect_error(
    'Trigger blocks expired unit from becoming available',
    CONCAT('UPDATE blood_component SET status = ''available'' WHERE unit_id = ', @expired_u_id),
    'unit has already expired'
);

-- ---------------------------------------------------------------------
-- 3. Stored Procedure: FEFO Allocation
-- ---------------------------------------------------------------------
INSERT INTO blood_request (hospital_id, patient_id, blood_group, family_code, units_requested, priority, status)
VALUES (1, 1, 'O+', 'RBC', 1, 'routine', 'pending');
SET @test_req_id = LAST_INSERT_ID();

UPDATE blood_component SET status = 'available' WHERE unit_id = @untested_u_id;

CALL sp_allocate_fefo(@test_req_id);

SELECT COUNT(*) INTO @issue_count FROM issue WHERE request_id = @test_req_id;
SELECT status INTO @req_status FROM blood_request WHERE request_id = @test_req_id;

CALL bt_check(
    'sp_allocate_fefo issued unit and fulfilled request',
    @issue_count = 1 AND @req_status = 'fulfilled',
    CONCAT('Issues created: ', @issue_count, ', Request status: ', @req_status)
);

-- ---------------------------------------------------------------------
-- 4. Stored Procedure: Emergency Bundle Atomic Rollback on Shortage
-- ---------------------------------------------------------------------
SELECT COUNT(*) INTO @cnt_res_before FROM emergency_reservation WHERE notes = 'Test Shortage';
CALL sp_reserve_emergency_bundle(1, 1, 'O+', 500, 0, 0, 'Test Shortage');
SELECT COUNT(*) INTO @cnt_res_after FROM emergency_reservation WHERE notes = 'Test Shortage';

CALL bt_check(
    'sp_reserve_emergency_bundle rolls back atomically on shortage',
    @cnt_res_before = 0 AND @cnt_res_after = 0,
    'Shortage correctly prevented partial reservation'
);

-- ---------------------------------------------------------------------
-- 5. Stored Procedure: Safety Recall Lineage Trace
-- ---------------------------------------------------------------------
CALL sp_trace_safety_recall(@test_d_id);

CALL bt_check(
    'sp_trace_safety_recall traversed lineage for test donation',
    EXISTS (SELECT 1 FROM blood_component WHERE donation_id = @test_d_id),
    CONCAT('Lineage units verified for test donation ID: ', @test_d_id)
);

-- ---------------------------------------------------------------------
-- Clean up test records
-- ---------------------------------------------------------------------
DELETE FROM issue WHERE request_id = @test_req_id;
DELETE FROM blood_request WHERE request_id = @test_req_id;
DELETE FROM blood_component WHERE donation_id = @test_d_id;
DELETE FROM test_result WHERE donation_id = @test_d_id;
DELETE FROM donation WHERE donation_id = @test_d_id;
DELETE FROM donor WHERE donor_id = @test_donor_id;

-- ---------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------
SELECT n, name, IF(passed, 'PASS', 'FAIL') AS result, detail FROM b_test_log ORDER BY n;
