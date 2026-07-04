<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

define('PATZER_ACCOUNT_PROFILE_FIELDS', PATZER_SYNC_ACCOUNT_PROFILE_FIELDS);
define('PATZER_ACCOUNT_CURSOR_FIELDS', PATZER_SYNC_ACCOUNT_CURSOR_FIELDS);

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);
$body = patzer_read_json_body();
$items = $body['items'] ?? null;
if (!is_array($items)) patzer_json(400, ['ok' => false, 'error' => 'Expected items array.']);
if (($body['protocol'] ?? null) === 'version-cas-v1') {
    patzer_handle_version_cas_push($pdo, $config, $items);
}

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

function patzer_legacy_write_accepts($existingRow, int $updatedAt, bool $deleted): bool {
    if (!is_array($existingRow)) return true;
    $existingUpdatedAt = isset($existingRow['updated_at_ms']) ? (int) $existingRow['updated_at_ms'] : 0;
    return $updatedAt > $existingUpdatedAt || ($updatedAt === $existingUpdatedAt && $deleted);
}

function patzer_legacy_rejected_item(string $store, string $itemKey, $existingRow): array {
    return [
        'store' => $store,
        'itemKey' => $itemKey,
        'code' => 'legacy-write-rejected',
        'retryable' => false,
        'message' => 'Legacy writes cannot update existing rows after the versioned CAS cutover.',
        'currentVersion' => is_array($existingRow) && isset($existingRow['version']) ? (int) $existingRow['version'] : 0,
    ];
}

function patzer_reject_legacy_if_existing(PDO $pdo, array $config, array $items): void {
    $readStmt = $pdo->prepare(
        'SELECT version
         FROM patzer_sync_items
         WHERE user_key = ? AND `store` = ? AND item_key = ?
         LIMIT 1'
    );
    $rejected = [];
    foreach ($items as $item) {
        if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Sync items must be objects.']);
        $store = patzer_item_store($item);
        $itemKey = patzer_item_key($item);
        $readStmt->execute([$config['user_key'], $store, $itemKey]);
        $existingRow = $readStmt->fetch();
        if (is_array($existingRow)) $rejected[] = patzer_legacy_rejected_item($store, $itemKey, $existingRow);
    }
    if (count($rejected) > 0) {
        patzer_json(409, [
            'ok' => false,
            'code' => 'legacy-write-rejected',
            'error' => 'Legacy write rejected because at least one target row already exists. Use protocol version-cas-v1.',
            'rejected' => $rejected,
        ]);
    }
}

function patzer_cas_string_field(array $item, string $key): ?string {
    $value = $item[$key] ?? null;
    return is_string($value) && trim($value) !== '' ? trim($value) : null;
}

function patzer_cas_base_version($value): array {
    if ($value === null) return ['ok' => true, 'baseVersion' => null];
    if (is_int($value) && $value >= 0) return ['ok' => true, 'baseVersion' => $value];
    if (is_float($value) && floor($value) === $value && $value >= 0) return ['ok' => true, 'baseVersion' => (int) $value];
    return ['ok' => false, 'error' => 'baseVersion must be null or a non-negative integer.'];
}

function patzer_cas_rejected(array $item, string $code, string $message, bool $retryable = false): array {
    $opId = patzer_cas_string_field($item, 'opId') ?? '';
    $store = patzer_cas_string_field($item, 'store');
    $itemKey = patzer_cas_string_field($item, 'itemKey');
    $rejected = [
        'opId' => $opId,
        'code' => $code,
        'retryable' => $retryable,
        'message' => $message,
    ];
    if (is_string($store)) $rejected['store'] = $store;
    if (is_string($itemKey)) $rejected['itemKey'] = $itemKey;
    return $rejected;
}

function patzer_cas_payload_json(array $item): array {
    if (!array_key_exists('payload', $item)) {
        return ['ok' => false, 'error' => 'Upsert operation requires payload.'];
    }
    $json = json_encode($item['payload'], JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) return ['ok' => false, 'error' => 'Payload could not be encoded.'];
    return ['ok' => true, 'payloadJson' => $json, 'payload' => $item['payload']];
}

function patzer_cas_versioned_item_from_row(array $row): array {
    $deleted = $row['deleted_at_ms'] !== null;
    $item = [
        'store' => (string) $row['store'],
        'itemKey' => (string) $row['item_key'],
        'version' => isset($row['version']) ? (int) $row['version'] : 0,
        'operation' => $deleted ? 'delete' : 'upsert',
        'deleted' => $deleted,
        'updatedAt' => isset($row['updated_at_ms']) ? (int) $row['updated_at_ms'] : 0,
    ];
    if (!$deleted) {
        $payload = json_decode((string) $row['payload_json'], true);
        if ($payload !== null || json_last_error() === JSON_ERROR_NONE) $item['payload'] = $payload;
    }
    return $item;
}

function patzer_cas_base_matches($baseVersion, $existingRow): bool {
    if (!is_array($existingRow)) return $baseVersion === null || $baseVersion === 0;
    if ($baseVersion === null || $baseVersion === 0) return false;
    $currentVersion = isset($existingRow['version']) ? (int) $existingRow['version'] : 0;
    return $currentVersion === $baseVersion;
}

function patzer_handle_version_cas_push(PDO $pdo, array $config, array $items): never {
    $lockMetaStmt = $pdo->prepare(
        'SELECT sync_version_next
         FROM patzer_sync_meta
         WHERE user_key = ?
         LIMIT 1
         FOR UPDATE'
    );
    $advanceMetaStmt = $pdo->prepare(
        'UPDATE patzer_sync_meta
         SET sync_version_next = ?
         WHERE user_key = ?'
    );
    $readRowStmt = $pdo->prepare(
        'SELECT `store`, item_key, version, payload_json, updated_at_ms, deleted_at_ms
         FROM patzer_sync_items
         WHERE user_key = ? AND `store` = ? AND item_key = ?
         LIMIT 1
         FOR UPDATE'
    );
    $writeRowStmt = $pdo->prepare(
        'INSERT INTO patzer_sync_items (user_key, `store`, item_key, version, payload_json, updated_at_ms, deleted_at_ms)
         VALUES (:user_key, :store_name, :item_key, :version, :payload_json, :updated_at_ms, :deleted_at_ms)
         ON DUPLICATE KEY UPDATE
           version = VALUES(version),
           payload_json = VALUES(payload_json),
           deleted_at_ms = VALUES(deleted_at_ms),
           updated_at_ms = VALUES(updated_at_ms)'
    );

    $accepted = [];
    $conflicts = [];
    $rejected = [];
    $latestVersion = 0;

    $pdo->beginTransaction();
    try {
        foreach ($items as $rawItem) {
            if (!is_array($rawItem)) {
                $rejected[] = [
                    'opId' => '',
                    'code' => 'invalid-payload',
                    'retryable' => false,
                    'message' => 'Write item must be an object.',
                ];
                continue;
            }

            $opId = patzer_cas_string_field($rawItem, 'opId');
            $store = patzer_cas_string_field($rawItem, 'store');
            $itemKey = patzer_cas_string_field($rawItem, 'itemKey');
            $operation = patzer_cas_string_field($rawItem, 'operation');
            $base = patzer_cas_base_version($rawItem['baseVersion'] ?? null);
            if (!$opId) {
                $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', 'Write item is missing opId.');
                continue;
            }
            if (!$store || !patzer_store_allowed($store)) {
                $rejected[] = patzer_cas_rejected($rawItem, 'unsupported-store', 'Write item has an unsupported store.');
                continue;
            }
            if (!$itemKey) {
                $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', 'Write item is missing itemKey.');
                continue;
            }
            if ($operation !== 'upsert' && $operation !== 'delete') {
                $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', 'Write item operation must be upsert or delete.');
                continue;
            }
            if (!$base['ok']) {
                $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', $base['error']);
                continue;
            }

            $payloadJson = null;
            $payload = null;
            if ($operation === 'upsert') {
                $payloadResult = patzer_cas_payload_json($rawItem);
                if (!$payloadResult['ok']) {
                    $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', $payloadResult['error']);
                    continue;
                }
                $payloadJson = $payloadResult['payloadJson'];
                $payload = $payloadResult['payload'];
            }

            patzer_sync_meta($pdo, $config['user_key']);
            $lockMetaStmt->execute([$config['user_key']]);
            $metaRow = $lockMetaStmt->fetch();
            $lockMetaStmt->closeCursor();
            $nextVersion = isset($metaRow['sync_version_next']) ? max(1, (int) $metaRow['sync_version_next']) : 1;

            $readRowStmt->execute([$config['user_key'], $store, $itemKey]);
            $existingRow = $readRowStmt->fetch();
            $readRowStmt->closeCursor();
            if (!patzer_cas_base_matches($base['baseVersion'], $existingRow)) {
                $current = is_array($existingRow) ? patzer_cas_versioned_item_from_row($existingRow) : null;
                if (is_array($current)) $latestVersion = max($latestVersion, (int) $current['version']);
                $conflict = [
                    'opId' => $opId,
                    'store' => $store,
                    'itemKey' => $itemKey,
                    'expectedBaseVersion' => $base['baseVersion'],
                ];
                if (is_array($current)) $conflict['current'] = $current;
                $conflicts[] = $conflict;
                continue;
            }

            if ($store === 'accounts' && $operation === 'upsert' && is_array($existingRow) && $existingRow['deleted_at_ms'] === null) {
                $existingPayload = json_decode((string) $existingRow['payload_json'], true);
                if (is_array($existingPayload) && is_array($payload)) {
                    $payload = patzer_merge_account_payload($existingPayload, $payload, $itemKey);
                    $payloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES);
                    if (!is_string($payloadJson)) {
                        $rejected[] = patzer_cas_rejected($rawItem, 'invalid-payload', 'Merged account payload could not be encoded.');
                        continue;
                    }
                }
            }

            $updatedAt = is_numeric($rawItem['clientUpdatedAt'] ?? null)
                ? max(0, (int) $rawItem['clientUpdatedAt'])
                : patzer_now_ms();
            if ($updatedAt <= 0) $updatedAt = patzer_now_ms();
            $deletedAt = $operation === 'delete' ? $updatedAt : null;
            $writeRowStmt->execute([
                ':user_key' => $config['user_key'],
                ':store_name' => $store,
                ':item_key' => $itemKey,
                ':version' => $nextVersion,
                ':payload_json' => $payloadJson,
                ':updated_at_ms' => $updatedAt,
                ':deleted_at_ms' => $deletedAt,
            ]);
            $advanceMetaStmt->execute([$nextVersion + 1, $config['user_key']]);

            $item = [
                'store' => $store,
                'itemKey' => $itemKey,
                'version' => $nextVersion,
                'operation' => $operation,
                'deleted' => $operation === 'delete',
                'updatedAt' => $updatedAt,
            ];
            if ($operation === 'upsert') $item['payload'] = $payload;
            $accepted[] = [
                'opId' => $opId,
                'store' => $store,
                'itemKey' => $itemKey,
                'operation' => $operation,
                'item' => $item,
            ];
            $latestVersion = max($latestVersion, $nextVersion);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        $lockMetaStmt->closeCursor();
        $readRowStmt->closeCursor();
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_json(500, ['ok' => false, 'error' => 'Versioned sync push failed.']);
    }

    $meta = patzer_sync_meta($pdo, $config['user_key']);
    patzer_json(200, [
        'ok' => true,
        'accepted' => $accepted,
        'conflicts' => $conflicts,
        'rejected' => $rejected,
        'latestVersion' => $latestVersion,
        'syncGeneration' => $meta['syncGeneration'],
        'generationReason' => $meta['generationReason'],
    ]);
}

$genericStmt = $pdo->prepare(
    'INSERT INTO patzer_sync_items (user_key, `store`, item_key, version, payload_json, updated_at_ms, deleted_at_ms)
     VALUES (:user_key, :store_name, :item_key, :version, :payload_json, :updated_at_ms, :deleted_at_ms)
     ON DUPLICATE KEY UPDATE
       version = VALUES(version),
       payload_json = VALUES(payload_json),
       deleted_at_ms = VALUES(deleted_at_ms),
       updated_at_ms = VALUES(updated_at_ms)'
);
$readGenericStmt = $pdo->prepare(
    'SELECT updated_at_ms, deleted_at_ms, version
     FROM patzer_sync_items
     WHERE user_key = ? AND `store` = ? AND item_key = ?
     LIMIT 1
     FOR UPDATE'
);
$readAccountStmt = $pdo->prepare(
    'SELECT payload_json, updated_at_ms, deleted_at_ms, version
     FROM patzer_sync_items
     WHERE user_key = ? AND `store` = ? AND item_key = ?
     LIMIT 1
     FOR UPDATE'
);
$updateAccountStmt = $pdo->prepare(
    'UPDATE patzer_sync_items
     SET version = :version,
         payload_json = :payload_json,
         deleted_at_ms = NULL,
         updated_at_ms = :updated_at_ms
     WHERE user_key = :user_key AND `store` = :store_name AND item_key = :item_key'
);

$counts = [];
$tombstones = [];
patzer_reject_legacy_if_existing($pdo, $config, $items);
$pdo->beginTransaction();
try {
    foreach ($items as $item) {
        if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Sync items must be objects.']);
        $store = patzer_item_store($item);
        $itemKey = patzer_item_key($item);
        $updatedAt = patzer_item_updated_at($item);
        if ($updatedAt <= 0) $updatedAt = patzer_now_ms();
        $deleted = patzer_item_deleted($item);
        $payloadJson = patzer_item_payload($item);

        if ($store === 'accounts' && !$deleted) {
            $payload = $item['payload'] ?? null;
            if (!is_array($payload)) patzer_json(400, ['ok' => false, 'error' => 'Account sync payload must be an object.']);
            $readAccountStmt->execute([$config['user_key'], $store, $itemKey]);
            $existingRow = $readAccountStmt->fetch();
            if (is_array($existingRow)) {
                $pdo->rollBack();
                patzer_json(409, [
                    'ok' => false,
                    'code' => 'legacy-write-rejected',
                    'error' => 'Legacy write rejected because the target row already exists. Use protocol version-cas-v1.',
                    'rejected' => [patzer_legacy_rejected_item($store, $itemKey, $existingRow)],
                ]);
            } else {
                $genericStmt->execute([
                    ':user_key' => $config['user_key'],
                    ':store_name' => $store,
                    ':item_key' => $itemKey,
                    ':version' => patzer_take_next_sync_version($pdo, $config['user_key']),
                    ':payload_json' => $payloadJson,
                    ':updated_at_ms' => max($updatedAt, patzer_account_updated_at($payload)),
                    ':deleted_at_ms' => null,
                ]);
            }
        } else {
            $readGenericStmt->execute([$config['user_key'], $store, $itemKey]);
            $existingRow = $readGenericStmt->fetch();
            if (is_array($existingRow)) {
                $pdo->rollBack();
                patzer_json(409, [
                    'ok' => false,
                    'code' => 'legacy-write-rejected',
                    'error' => 'Legacy write rejected because the target row already exists. Use protocol version-cas-v1.',
                    'rejected' => [patzer_legacy_rejected_item($store, $itemKey, $existingRow)],
                ]);
            }
            if (patzer_legacy_write_accepts($existingRow, $updatedAt, $deleted)) {
                $genericStmt->execute([
                    ':user_key' => $config['user_key'],
                    ':store_name' => $store,
                    ':item_key' => $itemKey,
                    ':version' => patzer_take_next_sync_version($pdo, $config['user_key']),
                    ':payload_json' => $payloadJson,
                    ':updated_at_ms' => $updatedAt,
                    ':deleted_at_ms' => $deleted ? $updatedAt : null,
                ]);
            }
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
