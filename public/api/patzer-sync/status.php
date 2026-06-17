<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_sync_meta($pdo, $config['user_key']);
$stmt = $pdo->prepare(
    'SELECT
       COUNT(*) AS count,
       SUM(CASE WHEN deleted_at_ms IS NOT NULL THEN 1 ELSE 0 END) AS tombstones,
       MAX(updated_at_ms) AS latest
     FROM patzer_sync_items
     WHERE user_key = ?'
);
$stmt->execute([$config['user_key']]);
$row = $stmt->fetch();

$storeStmt = $pdo->prepare(
    'SELECT
       `store`,
       COUNT(*) AS count,
       SUM(CASE WHEN deleted_at_ms IS NOT NULL THEN 1 ELSE 0 END) AS tombstones,
       MAX(updated_at_ms) AS latest
     FROM patzer_sync_items
     WHERE user_key = ?
     GROUP BY `store`'
);
$storeStmt->execute([$config['user_key']]);
$stores = [];
while ($storeRow = $storeStmt->fetch()) {
    $stores[(string) $storeRow['store']] = [
        'items' => isset($storeRow['count']) ? (int) $storeRow['count'] : 0,
        'tombstones' => isset($storeRow['tombstones']) ? (int) $storeRow['tombstones'] : 0,
        'latestUpdatedAt' => isset($storeRow['latest']) ? (int) $storeRow['latest'] : 0,
    ];
}

patzer_json(200, [
    'ok' => true,
    'userKey' => $config['user_key'],
    'items' => isset($row['count']) ? (int) $row['count'] : 0,
    'tombstones' => isset($row['tombstones']) ? (int) $row['tombstones'] : 0,
    'latestUpdatedAt' => isset($row['latest']) ? (int) $row['latest'] : 0,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
    'stores' => $stores,
]);
