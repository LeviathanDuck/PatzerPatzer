<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);
$body = patzer_read_json_body();
$items = $body['items'] ?? null;
if (!is_array($items)) patzer_json(400, ['ok' => false, 'error' => 'Expected items array.']);

const PATZER_ACCOUNT_PROFILE_FIELDS = ['displayName', 'category'];
const PATZER_ACCOUNT_CURSOR_FIELDS = ['lastSyncedAt', 'newestGameTimestamp', 'oldestGameTimestamp', 'syncFilterKey'];

function patzer_number_field(array $payload, string $key): int {
    $value = $payload[$key] ?? 0;
    return is_numeric($value) ? max(0, (int) $value) : 0;
}

function patzer_string_field(array $payload, string $key): ?string {
    $value = $payload[$key] ?? null;
    return is_string($value) && trim($value) !== '' ? $value : null;
}

function patzer_account_profile_updated_at(array $payload): int {
    return max(
        patzer_number_field($payload, 'profileUpdatedAt'),
        patzer_number_field($payload, 'addedAt')
    );
}

function patzer_account_cursor_updated_at(array $payload): int {
    return max(
        patzer_number_field($payload, 'syncCursorUpdatedAt'),
        patzer_number_field($payload, 'lastSyncedAt'),
        patzer_number_field($payload, 'newestGameTimestamp'),
        patzer_number_field($payload, 'oldestGameTimestamp')
    );
}

function patzer_account_updated_at(array $payload): int {
    return max(
        patzer_account_profile_updated_at($payload),
        patzer_account_cursor_updated_at($payload),
        patzer_number_field($payload, 'addedAt')
    );
}

function patzer_earliest_positive_timestamp(int $left, int $right): int {
    if ($left > 0 && $right > 0) return min($left, $right);
    return max($left, $right);
}

function patzer_copy_account_fields(array &$target, array $source, array $fields): void {
    foreach ($fields as $field) {
        if (array_key_exists($field, $source)) $target[$field] = $source[$field];
    }
}

function patzer_merge_account_payload(array $existing, array $incoming, string $itemKey): array {
    $existingProfileUpdatedAt = patzer_account_profile_updated_at($existing);
    $incomingProfileUpdatedAt = patzer_account_profile_updated_at($incoming);
    $existingCursorUpdatedAt = patzer_account_cursor_updated_at($existing);
    $incomingCursorUpdatedAt = patzer_account_cursor_updated_at($incoming);
    $profileSource = $incomingProfileUpdatedAt >= $existingProfileUpdatedAt ? $incoming : $existing;
    $cursorSource = $incomingCursorUpdatedAt >= $existingCursorUpdatedAt ? $incoming : $existing;
    $merged = array_replace($existing, $incoming);
    $addedAt = patzer_earliest_positive_timestamp(
        patzer_number_field($existing, 'addedAt'),
        patzer_number_field($incoming, 'addedAt')
    );

    $merged['id'] = patzer_string_field($existing, 'id') ?? patzer_string_field($incoming, 'id') ?? $itemKey;
    $merged['platform'] = patzer_string_field($existing, 'platform') ?? patzer_string_field($incoming, 'platform') ?? '';
    $merged['username'] = patzer_string_field($existing, 'username') ?? patzer_string_field($incoming, 'username') ?? '';
    $merged['addedAt'] = $addedAt;

    patzer_copy_account_fields($merged, $profileSource, PATZER_ACCOUNT_PROFILE_FIELDS);
    $merged['profileUpdatedAt'] = max(patzer_account_profile_updated_at($profileSource), $addedAt);

    patzer_copy_account_fields($merged, $cursorSource, PATZER_ACCOUNT_CURSOR_FIELDS);
    $merged['syncCursorUpdatedAt'] = patzer_account_cursor_updated_at($cursorSource);

    return $merged;
}

$genericStmt = $pdo->prepare(
    'INSERT INTO patzer_sync_items (user_key, `store`, item_key, payload_json, updated_at_ms, deleted_at_ms)
     VALUES (:user_key, :store_name, :item_key, :payload_json, :updated_at_ms, :deleted_at_ms)
     ON DUPLICATE KEY UPDATE
       payload_json = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(payload_json), payload_json),
       deleted_at_ms = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(deleted_at_ms), deleted_at_ms),
       updated_at_ms = GREATEST(updated_at_ms, VALUES(updated_at_ms))'
);
$readAccountStmt = $pdo->prepare(
    'SELECT payload_json, updated_at_ms, deleted_at_ms
     FROM patzer_sync_items
     WHERE user_key = ? AND `store` = ? AND item_key = ?
     LIMIT 1
     FOR UPDATE'
);
$updateAccountStmt = $pdo->prepare(
    'UPDATE patzer_sync_items
     SET payload_json = :payload_json,
         deleted_at_ms = NULL,
         updated_at_ms = :updated_at_ms
     WHERE user_key = :user_key AND `store` = :store_name AND item_key = :item_key'
);

$counts = [];
$tombstones = [];
$pdo->beginTransaction();
try {
    foreach ($items as $item) {
        if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Sync items must be objects.']);
        $store = patzer_item_store($item);
        $itemKey = patzer_item_key($item);
        $updatedAt = patzer_item_updated_at($item);
        $deleted = patzer_item_deleted($item);
        $payloadJson = patzer_item_payload($item);

        if ($store === 'accounts' && !$deleted) {
            $payload = $item['payload'] ?? null;
            if (!is_array($payload)) patzer_json(400, ['ok' => false, 'error' => 'Account sync payload must be an object.']);
            $readAccountStmt->execute([$config['user_key'], $store, $itemKey]);
            $existingRow = $readAccountStmt->fetch();
            if (is_array($existingRow) && $existingRow['deleted_at_ms'] === null) {
                $existingPayload = json_decode((string) $existingRow['payload_json'], true);
                if (!is_array($existingPayload)) $existingPayload = [];
                $merged = patzer_merge_account_payload($existingPayload, $payload, $itemKey);
                $mergedJson = json_encode($merged, JSON_UNESCAPED_SLASHES);
                if (!is_string($mergedJson)) patzer_json(400, ['ok' => false, 'error' => 'Merged account payload could not be encoded.']);
                $updateAccountStmt->execute([
                    ':payload_json' => $mergedJson,
                    ':updated_at_ms' => max((int) $existingRow['updated_at_ms'], $updatedAt, patzer_account_updated_at($merged)),
                    ':user_key' => $config['user_key'],
                    ':store_name' => $store,
                    ':item_key' => $itemKey,
                ]);
            } else {
                $genericStmt->execute([
                    ':user_key' => $config['user_key'],
                    ':store_name' => $store,
                    ':item_key' => $itemKey,
                    ':payload_json' => $payloadJson,
                    ':updated_at_ms' => max($updatedAt, patzer_account_updated_at($payload)),
                    ':deleted_at_ms' => null,
                ]);
            }
        } else {
            $genericStmt->execute([
                ':user_key' => $config['user_key'],
                ':store_name' => $store,
                ':item_key' => $itemKey,
                ':payload_json' => $payloadJson,
                ':updated_at_ms' => $updatedAt,
                ':deleted_at_ms' => $deleted ? $updatedAt : null,
            ]);
        }
        $counts[$store] = ($counts[$store] ?? 0) + 1;
        if ($deleted) $tombstones[$store] = ($tombstones[$store] ?? 0) + 1;
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Sync push failed.']);
}

patzer_json(200, ['ok' => true, 'counts' => $counts, 'tombstones' => $tombstones]);
