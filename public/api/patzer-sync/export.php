<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_sync_meta($pdo, $config['user_key']);

$stmt = $pdo->prepare(
    'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms
     FROM patzer_sync_items
     WHERE user_key = ?
     ORDER BY `store` ASC, item_key ASC'
);
$stmt->execute([$config['user_key']]);

$items = [];
$counts = ['items' => 0, 'tombstones' => 0, 'stores' => []];
$skippedMalformedJson = 0;
$repairedInvalidUpdatedAt = 0;
$exportedAtMs = patzer_now_ms();
while ($row = $stmt->fetch()) {
    $store = (string) $row['store'];
    $deleted = $row['deleted_at_ms'] !== null;
    $updatedAt = (int) $row['updated_at_ms'];
    if ($updatedAt <= 0) {
        $updatedAt = $exportedAtMs;
        $repairedInvalidUpdatedAt++;
    }
    $payload = null;
    if (!$deleted) {
        $payload = json_decode((string) $row['payload_json'], true);
        if ($payload === null && json_last_error() !== JSON_ERROR_NONE) {
            $skippedMalformedJson++;
            continue;
        }
    }
    $items[] = [
        'store' => $store,
        'itemKey' => $row['item_key'],
        'updatedAt' => $updatedAt,
        'operation' => $deleted ? 'delete' : 'upsert',
        'deleted' => $deleted,
        'payload' => $payload,
    ];
    $counts['items']++;
    if ($deleted) $counts['tombstones']++;
    if (!isset($counts['stores'][$store])) {
        $counts['stores'][$store] = ['items' => 0, 'tombstones' => 0];
    }
    $counts['stores'][$store]['items']++;
    if ($deleted) $counts['stores'][$store]['tombstones']++;
}

patzer_json(200, [
    'ok' => true,
    'format' => 'patzer-sync-backup',
    'version' => 1,
    'exportedAt' => gmdate('c'),
    'userKey' => $config['user_key'],
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
    'items' => $items,
    'counts' => $counts,
    'skippedMalformedJson' => $skippedMalformedJson,
    'repairedInvalidUpdatedAt' => $repairedInvalidUpdatedAt,
]);
