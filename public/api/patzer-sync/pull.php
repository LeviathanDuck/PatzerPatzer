<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$meta = patzer_require_fresh_generation($pdo, $config);
$since = patzer_since();
$cursor = patzer_pull_cursor();

if (isset($_GET['store']) && $_GET['store'] !== '') {
    $store = (string) $_GET['store'];
    if (!patzer_store_allowed($store)) patzer_json(400, ['ok' => false, 'error' => 'Unsupported store.']);
    $stores = [$store];
} else {
    $stores = PATZER_ALLOWED_STORES;
}

function patzer_pull_cursor(): ?int {
    if (!array_key_exists('cursor', $_GET)) return null;
    $cursor = trim((string) $_GET['cursor']);
    if ($cursor === '' || !preg_match('/^\d+$/', $cursor)) {
        patzer_json(400, ['ok' => false, 'error' => 'Invalid version cursor.']);
    }
    return (int) $cursor;
}

function patzer_pull_item_from_row(array $row, int &$latestUpdatedAt, int &$latestVersion, int &$skippedMalformedJson): ?array {
    $deleted = $row['deleted_at_ms'] !== null;
    $payload = null;
    if (!$deleted) {
        $payload = json_decode((string) $row['payload_json'], true);
        if ($payload === null && json_last_error() !== JSON_ERROR_NONE) {
            $skippedMalformedJson++;
            return null;
        }
    }
    $updatedAt = (int) $row['updated_at_ms'];
    $version = isset($row['version']) ? (int) $row['version'] : 0;
    if ($updatedAt > $latestUpdatedAt) $latestUpdatedAt = $updatedAt;
    if ($version > $latestVersion) $latestVersion = $version;
    return [
        'store' => $row['store'],
        'itemKey' => $row['item_key'],
        'version' => $version,
        'updatedAt' => $updatedAt,
        'deleted' => $deleted,
        'operation' => $deleted ? 'delete' : 'upsert',
        'payload' => $payload,
    ];
}

$items = [];
$latestUpdatedAt = 0;
$latestVersion = $cursor ?? 0;
$skippedMalformedJson = 0;

if ($cursor !== null) {
    if (isset($store)) {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms, version
             FROM patzer_sync_items
             WHERE user_key = ? AND `store` = ? AND version > ?
             ORDER BY version ASC, `store` ASC, item_key ASC'
        );
        $stmt->execute([$config['user_key'], $store, $cursor]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms, version
             FROM patzer_sync_items
             WHERE user_key = ? AND version > ?
             ORDER BY version ASC, `store` ASC, item_key ASC'
        );
        $stmt->execute([$config['user_key'], $cursor]);
    }

    while ($row = $stmt->fetch()) {
        $item = patzer_pull_item_from_row($row, $latestUpdatedAt, $latestVersion, $skippedMalformedJson);
        if ($item !== null) $items[] = $item;
    }

    patzer_json(200, [
        'ok' => true,
        'items' => $items,
        'latestVersion' => $latestVersion,
        'latestUpdatedAt' => $latestUpdatedAt,
        'skippedMalformedJson' => $skippedMalformedJson,
        'syncGeneration' => $meta['syncGeneration'],
        'generationReason' => $meta['generationReason'],
    ]);
}

foreach ($stores as $store) {
    if ($since === null) {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms, version
             FROM patzer_sync_items
             WHERE user_key = ? AND `store` = ?
             ORDER BY updated_at_ms ASC'
        );
        $stmt->execute([$config['user_key'], $store]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms, deleted_at_ms, version
             FROM patzer_sync_items
             WHERE user_key = ? AND `store` = ? AND updated_at_ms > ?
             ORDER BY updated_at_ms ASC'
        );
        $stmt->execute([$config['user_key'], $store, $since]);
    }

    while ($row = $stmt->fetch()) {
        $item = patzer_pull_item_from_row($row, $latestUpdatedAt, $latestVersion, $skippedMalformedJson);
        if ($item !== null) $items[] = $item;
    }
}

patzer_json(200, [
    'ok' => true,
    'items' => $items,
    'latestVersion' => $latestVersion,
    'latestUpdatedAt' => $latestUpdatedAt,
    'skippedMalformedJson' => $skippedMalformedJson,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
