<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$body = patzer_read_json_body();
$items = $body['items'] ?? null;
if (!is_array($items)) patzer_json(400, ['ok' => false, 'error' => 'Expected items array.']);

$stmt = $pdo->prepare(
    'INSERT INTO patzer_sync_items (user_key, `store`, item_key, payload_json, updated_at_ms, deleted_at_ms)
     VALUES (:user_key, :store_name, :item_key, :payload_json, :updated_at_ms, :deleted_at_ms)
     ON DUPLICATE KEY UPDATE
       payload_json = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(payload_json), payload_json),
       deleted_at_ms = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(deleted_at_ms), deleted_at_ms),
       updated_at_ms = GREATEST(updated_at_ms, VALUES(updated_at_ms))'
);

$counts = [];
$tombstones = [];
$pdo->beginTransaction();
try {
    foreach ($items as $item) {
        if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Sync items must be objects.']);
        $store = patzer_item_store($item);
        $updatedAt = patzer_item_updated_at($item);
        $deleted = patzer_item_deleted($item);
        $stmt->execute([
            ':user_key' => $config['user_key'],
            ':store_name' => $store,
            ':item_key' => patzer_item_key($item),
            ':payload_json' => patzer_item_payload($item),
            ':updated_at_ms' => $updatedAt,
            ':deleted_at_ms' => $deleted ? $updatedAt : null,
        ]);
        $counts[$store] = ($counts[$store] ?? 0) + 1;
        if ($deleted) $tombstones[$store] = ($tombstones[$store] ?? 0) + 1;
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Sync push failed.']);
}

patzer_json(200, ['ok' => true, 'counts' => $counts, 'tombstones' => $tombstones]);
