<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_require_fresh_generation($pdo, $config);
$body = patzer_read_json_body();

if (($body['format'] ?? null) !== 'patzer-sync-backup') {
    patzer_json(400, ['ok' => false, 'error' => 'Unsupported backup format.']);
}
if (($body['version'] ?? null) !== 1) {
    patzer_json(400, ['ok' => false, 'error' => 'Unsupported backup version.']);
}
if (isset($body['userKey']) && is_string($body['userKey']) && $body['userKey'] !== $config['user_key']) {
    patzer_json(400, ['ok' => false, 'error' => 'Backup user key does not match this token database.']);
}

$restoreId = bin2hex(random_bytes(16));
$stmt = $pdo->prepare('DELETE FROM patzer_sync_restore_items WHERE user_key = ? AND restore_id = ?');
$stmt->execute([$config['user_key'], $restoreId]);

patzer_json(200, [
    'ok' => true,
    'restoreId' => $restoreId,
    // Advertise the restore payload-serialization contract so the new client can require this
    // capability before it begins sending exact payloadJson chunks (server-first rollout). Old
    // servers omit this field; new clients must fail closed when it is absent.
    'restoreHashContract' => PATZER_RESTORE_HASH_CONTRACT,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
