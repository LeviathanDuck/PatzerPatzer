<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);
// Exact-payloadJson chunks carry raw payload strings, so this endpoint bounds the request body
// (rejected 413 before any decode) instead of reading an unlimited php://input.
$body = patzer_read_json_body(PATZER_RESTORE_CHUNK_MAX_BYTES);
$restoreId = patzer_restore_id($body);
$items = $body['items'] ?? null;
if (!is_array($items)) patzer_json(400, ['ok' => false, 'error' => 'Expected items array.']);

$rows = [];
$counts = [];
$tombstones = [];
foreach ($items as $item) {
    if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Restore items must be objects.']);
    if (!array_key_exists('updatedAt', $item) && !array_key_exists('updated_at_ms', $item)) {
        patzer_json(400, ['ok' => false, 'error' => 'Restore item is missing updatedAt.']);
    }
    $store = patzer_item_store($item);
    $itemKey = patzer_item_key($item);
    $updatedAt = patzer_item_updated_at($item);
    if ($updatedAt <= 0) patzer_json(400, ['ok' => false, 'error' => 'Restore item has an invalid updatedAt.']);
    $deleted = patzer_item_deleted($item);
    $rows[] = [
        'store' => $store,
        'itemKey' => $itemKey,
        'updatedAt' => $updatedAt,
        'deletedAt' => $deleted ? $updatedAt : null,
        // exact-payload-json-v1: prefer the browser's transported payloadJson bytes verbatim; fall
        // back to the legacy decoded-object re-encode for old clients during the rollout window.
        'payload' => patzer_restore_item_payload($item),
    ];
    $counts[$store] = ($counts[$store] ?? 0) + 1;
    if ($deleted) $tombstones[$store] = ($tombstones[$store] ?? 0) + 1;
}

$stmt = $pdo->prepare(
    'INSERT INTO patzer_sync_restore_items (restore_id, user_key, `store`, item_key, payload_json, updated_at_ms, deleted_at_ms)
     VALUES (:restore_id, :user_key, :store_name, :item_key, :payload_json, :updated_at_ms, :deleted_at_ms)
     ON DUPLICATE KEY UPDATE
       payload_json = VALUES(payload_json),
       updated_at_ms = VALUES(updated_at_ms),
       deleted_at_ms = VALUES(deleted_at_ms)'
);

$pdo->beginTransaction();
try {
    foreach ($rows as $row) {
        $stmt->execute([
            ':restore_id' => $restoreId,
            ':user_key' => $config['user_key'],
            ':store_name' => $row['store'],
            ':item_key' => $row['itemKey'],
            ':payload_json' => $row['payload'],
            ':updated_at_ms' => $row['updatedAt'],
            ':deleted_at_ms' => $row['deletedAt'],
        ]);
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Restore chunk failed.']);
}

patzer_json(200, ['ok' => true, 'counts' => $counts, 'tombstones' => $tombstones]);
