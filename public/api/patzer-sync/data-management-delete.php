<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_require_fresh_generation($pdo, $config);
$body = patzer_read_json_body();
$items = $body['items'] ?? null;
if (!is_array($items)) patzer_json(400, ['ok' => false, 'error' => 'Expected items array.']);

$deleteKeys = [];
$seen = [];
foreach ($items as $item) {
    if (!is_array($item)) patzer_json(400, ['ok' => false, 'error' => 'Delete items must be objects.']);
    $store = patzer_item_store($item);
    $itemKey = patzer_item_key($item);
    $dedupeKey = $store . "\0" . $itemKey;
    if (isset($seen[$dedupeKey])) continue;
    $seen[$dedupeKey] = true;
    $deleteKeys[] = ['store' => $store, 'itemKey' => $itemKey];
}

$readStmt = $pdo->prepare(
    'SELECT updated_at_ms, version
     FROM patzer_sync_items
     WHERE user_key = ? AND `store` = ? AND item_key = ?
     LIMIT 1
     FOR UPDATE'
);
$writeStmt = $pdo->prepare(
    'INSERT INTO patzer_sync_items (user_key, `store`, item_key, version, payload_json, updated_at_ms, deleted_at_ms)
     VALUES (:user_key, :store_name, :item_key, :version, NULL, :updated_at_ms, :deleted_at_ms)
     ON DUPLICATE KEY UPDATE
       version = VALUES(version),
       payload_json = NULL,
       deleted_at_ms = VALUES(deleted_at_ms),
       updated_at_ms = VALUES(updated_at_ms)'
);
$finalReadStmt = $pdo->prepare(
    'SELECT updated_at_ms, deleted_at_ms, version
     FROM patzer_sync_items
     WHERE user_key = ? AND `store` = ? AND item_key = ?
     LIMIT 1'
);
$advanceMetaStmt = $pdo->prepare(
    'UPDATE patzer_sync_meta
     SET sync_version_next = ?
     WHERE user_key = ?'
);

function patzer_delete_row_rejection(string $store, string $itemKey, Throwable $error): array {



    $sqlState = null;
    $errno = null;
    if ($error instanceof PDOException) {
        $info = $error->errorInfo ?? null;
        $sqlState = is_array($info) && isset($info[0]) ? (string) $info[0] : (is_string($error->getCode()) ? $error->getCode() : null);
        $errno = is_array($info) && isset($info[1]) ? (int) $info[1] : null;
    }
    if ($sqlState === '40001' || $errno === 1213 || $errno === 1205) {
        $code = 'server-busy';
        $retryable = true;
        $message = 'Row delete hit database contention; retry.';
    } elseif ($sqlState === '22001' || $sqlState === '22007' || $errno === 1406 || $errno === 1366) {
        $code = 'invalid-payload';
        $retryable = false;
        $message = 'Row delete was rejected by the database.';
    } else {
        $code = 'server-error';
        $retryable = true;
        $message = 'Row delete failed on the server; retry.';
    }
    return [
        'store' => $store,
        'itemKey' => $itemKey,
        'code' => $code,
        'retryable' => $retryable,
        'message' => $message,
    ];
}

$responseItems = [];
$rejected = [];
$counts = ['items' => 0, 'tombstones' => 0];
$latestUpdatedAt = 0;
$latestVersion = 0;







foreach ($deleteKeys as $deleteKey) {
    $store = $deleteKey['store'];
    $itemKey = $deleteKey['itemKey'];
    try {
        $pdo->beginTransaction();
        $lockedMeta = patzer_require_locked_fresh_generation($pdo, $config);
        $readStmt->execute([$config['user_key'], $store, $itemKey]);
        $existing = $readStmt->fetch();
        $readStmt->closeCursor();
        $existingUpdatedAt = is_array($existing) ? (int) $existing['updated_at_ms'] : 0;
        $updatedAt = max(patzer_now_ms(), $existingUpdatedAt + 1);
        $version = $lockedMeta['syncVersionNext'];
        $writeStmt->execute([
            ':user_key' => $config['user_key'],
            ':store_name' => $store,
            ':item_key' => $itemKey,
            ':version' => $version,
            ':updated_at_ms' => $updatedAt,
            ':deleted_at_ms' => $updatedAt,
        ]);
        $advanceMetaStmt->execute([$version + 1, $config['user_key']]);
        $finalReadStmt->execute([$config['user_key'], $store, $itemKey]);
        $final = $finalReadStmt->fetch();
        $finalReadStmt->closeCursor();
        $pdo->commit();
    } catch (Throwable $error) {
        $readStmt->closeCursor();
        $finalReadStmt->closeCursor();
        if ($pdo->inTransaction()) $pdo->rollBack();
        $rejected[] = patzer_delete_row_rejection($store, $itemKey, $error);
        continue;
    }

    if (!is_array($final) || $final['deleted_at_ms'] === null) {
        $rejected[] = [
            'store' => $store,
            'itemKey' => $itemKey,
            'code' => 'server-error',
            'retryable' => true,
            'message' => 'Tombstone write did not verify on read-back.',
        ];
        continue;
    }
    $finalUpdatedAt = (int) $final['updated_at_ms'];
    $finalVersion = isset($final['version']) ? (int) $final['version'] : $version;
    $responseItems[] = [
        'store' => $store,
        'itemKey' => $itemKey,
        'version' => $finalVersion,
        'updatedAt' => $finalUpdatedAt,
        'deleted' => true,
        'operation' => 'delete',
    ];
    $counts['items']++;
    $counts['tombstones']++;
    $counts[$store] = ($counts[$store] ?? 0) + 1;
    $latestUpdatedAt = max($latestUpdatedAt, $finalUpdatedAt);
    $latestVersion = max($latestVersion, $finalVersion);
}

patzer_json(200, [
    'ok' => true,
    'items' => $responseItems,
    'counts' => $counts,
    'rejected' => $rejected,
    'latestUpdatedAt' => $latestUpdatedAt,
    'latestVersion' => $latestVersion,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
