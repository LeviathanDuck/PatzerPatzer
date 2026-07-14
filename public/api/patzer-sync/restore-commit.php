<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);
$body = patzer_read_json_body();
$restoreId = patzer_restore_id($body);

$expectedItems = isset($body['expectedItems']) && is_numeric($body['expectedItems']) ? (int) $body['expectedItems'] : -1;
$expectedTombstones = isset($body['expectedTombstones']) && is_numeric($body['expectedTombstones']) ? (int) $body['expectedTombstones'] : -1;
$expectedHash = isset($body['expectedHash']) && is_string($body['expectedHash']) ? strtolower($body['expectedHash']) : '';
if ($expectedItems < 0 || $expectedTombstones < 0 || !preg_match('/^[a-f0-9]{64}$/', $expectedHash)) {
    patzer_json(400, ['ok' => false, 'error' => 'Restore commit is missing expected counts or hash.']);
}

$read = $pdo->prepare(
    'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms
     FROM patzer_sync_restore_items
     WHERE restore_id = ? AND user_key = ?
     ORDER BY `store` ASC, item_key ASC'
);
$read->execute([$restoreId, $config['user_key']]);
$rows = $read->fetchAll();
$actualItems = count($rows);
$actualTombstones = 0;
foreach ($rows as $row) {
    if ($row['deleted_at_ms'] !== null) $actualTombstones++;
}
$actualHash = patzer_restore_hash_for_rows($rows);
if ($actualItems !== $expectedItems || $actualTombstones !== $expectedTombstones || $actualHash !== $expectedHash) {
    patzer_json(400, [
        'ok' => false,
        'error' => 'Restore staged data does not match the selected backup.',
        'actualItems' => $actualItems,
        'actualTombstones' => $actualTombstones,
    ]);
}

$pdo->beginTransaction();
try {
    $deleteLive = $pdo->prepare('DELETE FROM patzer_sync_items WHERE user_key = ?');
    $deleteLive->execute([$config['user_key']]);

    $insertLive = $pdo->prepare(
        'INSERT INTO patzer_sync_items (user_key, `store`, item_key, version, payload_json, updated_at_ms, deleted_at_ms)
         VALUES (:user_key, :store_name, :item_key, :version, :payload_json, :updated_at_ms, :deleted_at_ms)'
    );
    $nextVersion = 1;
    foreach ($rows as $row) {
        $insertLive->execute([
            ':user_key' => $config['user_key'],
            ':store_name' => $row['store'],
            ':item_key' => $row['item_key'],
            ':version' => $nextVersion,
            ':payload_json' => $row['payload_json'],
            ':updated_at_ms' => (int) $row['updated_at_ms'],
            ':deleted_at_ms' => $row['deleted_at_ms'] === null ? null : (int) $row['deleted_at_ms'],
        ]);
        $nextVersion++;
    }

    $updateVersionMeta = $pdo->prepare(
        'UPDATE patzer_sync_meta
         SET sync_version_next = ?
         WHERE user_key = ?'
    );
    $updateVersionMeta->execute([$nextVersion, $config['user_key']]);

    $deleteStage = $pdo->prepare('DELETE FROM patzer_sync_restore_items WHERE restore_id = ? AND user_key = ?');
    $deleteStage->execute([$restoreId, $config['user_key']]);

    $meta = patzer_bump_generation($pdo, $config['user_key'], 'restore');
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Restore commit failed.']);
}

patzer_json(200, [
    'ok' => true,
    'items' => $actualItems,
    'tombstones' => $actualTombstones,
    'latestVersion' => max(0, $nextVersion - 1),
    'syncVersionNext' => $nextVersion,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
