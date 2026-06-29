-- Merge ABD sites (3, 4, 5) into a single "ABD" industry
BEGIN;

-- 1: Create new ABD site
WITH new_site AS (
  INSERT INTO industry_sites (name, api_key, location, is_active, amc_expiry)
  VALUES ('ABD', 'uk_' || encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), 'Telangana', true, '2027-06-24 00:00:00')
  RETURNING id
)
SELECT id INTO TEMP TABLE _new_abd_id FROM new_site;

-- 2: Move devices to ABD
UPDATE devices SET site_id = (SELECT id FROM _new_abd_id) WHERE site_id IN (3, 4, 5);

-- 3: Update telemetry_data
UPDATE telemetry_data SET site_id = (SELECT id FROM _new_abd_id) WHERE site_id IN (3, 4, 5);

-- 4: Update broadcasts
UPDATE broadcasts SET target_site_id = (SELECT id FROM _new_abd_id) WHERE target_site_id IN (3, 4, 5);

-- 5: Update pending_commands
UPDATE pending_commands SET site_id = (SELECT id FROM _new_abd_id) WHERE site_id IN (3, 4, 5);

-- 6: Update pending_updates
UPDATE pending_updates SET site_id = (SELECT id FROM _new_abd_id) WHERE site_id IN (3, 4, 5);

-- 7: Delete old sites
DELETE FROM industry_sites WHERE id IN (3, 4, 5);

-- 8: Verify
SELECT id, name, api_key FROM industry_sites WHERE name = 'ABD';
SELECT COUNT(*) AS device_count FROM devices WHERE site_id = (SELECT id FROM industry_sites WHERE name = 'ABD');

COMMIT;
