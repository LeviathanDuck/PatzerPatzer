<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_sync_meta($pdo, $config['user_key']);
$schema = patzer_sync_schema_checks($pdo);
$stmt = $pdo->prepare(
    'SELECT
       COUNT(*) AS count,
       SUM(CASE WHEN deleted_at_ms IS NULL THEN 1 ELSE 0 END) AS live_count,
       SUM(CASE WHEN deleted_at_ms IS NOT NULL THEN 1 ELSE 0 END) AS tombstones,
       SUM(CASE WHEN version = 0 THEN 1 ELSE 0 END) AS zero_version_rows,
       MAX(updated_at_ms) AS latest,
       MAX(version) AS latest_version
     FROM patzer_sync_items
     WHERE user_key = ?'
);
$stmt->execute([$config['user_key']]);
$row = $stmt->fetch();

$storeStmt = $pdo->prepare(
    'SELECT
       `store`,
       COUNT(*) AS count,
       SUM(CASE WHEN deleted_at_ms IS NULL THEN 1 ELSE 0 END) AS live_count,
       SUM(CASE WHEN deleted_at_ms IS NOT NULL THEN 1 ELSE 0 END) AS tombstones,
       SUM(CASE WHEN version = 0 THEN 1 ELSE 0 END) AS zero_version_rows,
       MAX(updated_at_ms) AS latest,
       MAX(version) AS latest_version
     FROM patzer_sync_items
     WHERE user_key = ?
     GROUP BY `store`'
);
$storeStmt->execute([$config['user_key']]);
$stores = [];
while ($storeRow = $storeStmt->fetch()) {
    $stores[(string) $storeRow['store']] = [
        'items' => isset($storeRow['count']) ? (int) $storeRow['count'] : 0,
        'liveRows' => isset($storeRow['live_count']) ? (int) $storeRow['live_count'] : 0,
        'tombstones' => isset($storeRow['tombstones']) ? (int) $storeRow['tombstones'] : 0,
        'zeroVersionRows' => isset($storeRow['zero_version_rows']) ? (int) $storeRow['zero_version_rows'] : 0,
        'latestUpdatedAt' => isset($storeRow['latest']) ? (int) $storeRow['latest'] : 0,
        'latestVersion' => isset($storeRow['latest_version']) ? (int) $storeRow['latest_version'] : 0,
    ];
}

patzer_json(200, [
    'ok' => true,
    'userKey' => $config['user_key'],
    'items' => isset($row['count']) ? (int) $row['count'] : 0,
    'liveRows' => isset($row['live_count']) ? (int) $row['live_count'] : 0,
    'tombstones' => isset($row['tombstones']) ? (int) $row['tombstones'] : 0,
    'zeroVersionRows' => isset($row['zero_version_rows']) ? (int) $row['zero_version_rows'] : 0,
    'latestUpdatedAt' => isset($row['latest']) ? (int) $row['latest'] : 0,
    'latestVersion' => isset($row['latest_version']) ? (int) $row['latest_version'] : 0,
    'syncGeneration' => $meta['syncGeneration'],
    'syncVersionNext' => $meta['syncVersionNext'],
    'generationReason' => $meta['generationReason'],
    'schema' => $schema,
    'stores' => (object) $stores,
]);
