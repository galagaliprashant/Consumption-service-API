/**
 * Data-driven module/testcase catalog for the dashboard.
 *
 * Seeded from the real pytest suite under automation/tests/. Each module's
 * `id` is the pytest marker declared on that file (see automation/pytest.ini
 * and the @pytest.mark.<marker> decorators in automation/tests/*.py) so it
 * can be passed straight through as `pytest -m <id>` once testRunner.js is
 * wired up to a real backend. Each testcase's `id` is the test function name
 * (`pytest automation/tests/<file>.py::<id>`), so a single testcase can be
 * targeted with `-k <id>` too.
 *
 * Keep this in sync with automation/tests/ by hand for now, or generate it
 * with `pytest --collect-only -q` (or `--collect-only --json-report`) piped
 * through a small script that groups by marker.
 *
 * Required shape per module:
 *   {
 *     id: string            — stable, unique, used as the DOM/report key
 *     name: string          — display name
 *     description: string   — one-line summary shown under the name
 *     testCases: [
 *       { id: string, name: string }
 *     ]
 *   }
 */
const TEST_MODULES = [
  {
    id: "auth",
    name: "Authentication",
    description: "automation/tests/test_auth.py",
    testCases: [
      { id: "test_login_success", name: "AUTH-001 — User can successfully authenticate" },
    ],
  },
  {
    id: "aircraft",
    name: "Aircraft Details",
    description: "automation/tests/test_aircraft_details.py",
    testCases: [
      { id: "test_aircraft_details_valid", name: "AIR-001 — Aircraft details API returns a successful response" },
    ],
  },
  {
    id: "aircraft_status",
    name: "Aircraft Status",
    description: "automation/tests/test_aircraft_status.py",
    testCases: [
      { id: "test_aircraft_status_valid", name: "STAT-AC-P01 — Aircraft status endpoint returns 200" },
      { id: "test_aircraft_status_aircraft_id", name: "Aircraft status response includes the aircraft ID" },
      { id: "test_aircraft_status_aircraft_status", name: "Aircraft status field is present and valid" },
      { id: "test_aircraft_status_aircraft_type", name: "Aircraft type field is present and valid" },
      { id: "test_aircraft_status_err_devices", name: "Errored devices are reported in aircraft status" },
    ],
  },
  {
    id: "device",
    name: "Device Status",
    description: "automation/tests/test_device_status.py",
    testCases: [
      { id: "test_device_status_and_capture_aircraft", name: "DEV-001 — Device status API succeeds and captures aircraft ID" },
    ],
  },
  {
    id: "device_details",
    name: "Device Details",
    description: "automation/tests/test_device_details.py",
    testCases: [
      { id: "test_device_details_valid", name: "AD-DEVICE-P01 — Device details returned for a valid PN/SN" },
      { id: "test_device_details_software_version", name: "Device details include the software version" },
      { id: "test_device_details_errors", name: "Device details include reported errors" },
    ],
  },
  {
    id: "info_notifications",
    name: "Info Notifications",
    description: "automation/tests/test_info_notifications.py",
    testCases: [
      { id: "test_info_notifications_valid", name: "Info notifications endpoint returns success" },
      { id: "test_info_notifications_empty_body", name: "Info notifications handle an empty body" },
      { id: "test_info_notifications_extra_field", name: "Info notifications handle an unexpected extra field" },
      { id: "test_info_failure_code", name: "Info notifications include a failure code" },
      { id: "test_info_device_details", name: "Info notifications include device details" },
    ],
  },
  {
    id: "notification_details",
    name: "Notification Details",
    description: "automation/tests/test_notification_details.py",
    testCases: [
      { id: "test_notification_details_valid", name: "Notification details returned for a valid device/failure code" },
      { id: "test_notification_failure_name", name: "Notification details include the failure name" },
      { id: "test_notification_failure_type", name: "Notification details include the failure type" },
      { id: "test_notification_inspection_instructions", name: "Notification details include inspection instructions" },
      { id: "test_notification_repair_instructions", name: "Notification details include repair instructions" },
    ],
  },
  {
    id: "moderate_notifications",
    name: "Moderate Notifications",
    description: "automation/tests/test_moderate_notifications.py",
    testCases: [
      { id: "test_moderate_notifications_valid", name: "Moderate notifications endpoint returns success" },
      { id: "test_moderate_notifications_empty_body", name: "Moderate notifications handle an empty body" },
      { id: "test_moderate_notifications_extra_field", name: "Moderate notifications handle an unexpected extra field" },
      { id: "test_moderate_failure_information", name: "Moderate notifications include failure information" },
      { id: "test_moderate_repeat_count", name: "Moderate notifications include a repeat count" },
      { id: "test_moderate_device_information", name: "Moderate notifications include device information" },
    ],
  },
  {
    id: "critical_notifications",
    name: "Critical Notifications",
    description: "automation/tests/test_critical_notifications.py",
    testCases: [
      { id: "test_critical_notifications_valid", name: "NOTIF-CRIT-P01 — Critical notifications endpoint returns success" },
      { id: "test_critical_notifications_empty_result", name: "Critical notifications handle an empty result set" },
      { id: "test_critical_notifications_extra_field", name: "Critical notifications handle an unexpected extra field" },
      { id: "test_critical_notification_failure_code", name: "Critical notifications include a failure code" },
      { id: "test_critical_notification_device_information", name: "Critical notifications include device information" },
      { id: "test_critical_notification_time_of_failure", name: "Critical notifications include time of failure" },
    ],
  },
  {
    id: "update_error_status",
    name: "Update Error Status",
    description: "automation/tests/test_update_error_status.py",
    testCases: [
      { id: "test_update_error_status_valid", name: "Update error status accepts a valid update" },
    ],
  },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TEST_MODULES };
}
