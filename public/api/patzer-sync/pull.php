<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$since = patzer_since();

$stores = [];
if (isset($_GET['store']) && $_GET['store'] !== '') {
    $store = (string) $_GET['store'];
    if (!patzer_store_allowed($store)) patzer_json(400, ['ok' => false, 'error' => 'Unsupported store.']);
    $stores[] = $store;
} else {
    $stores = PATZER_ALLOWED_STORES;
}

$items = [];
foreach ($stores as $store) {
    if ($since === null) {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms
             FROM patzer_sync_items
             WHERE user_key = ? AND `store` = ?
             ORDER BY updated_at_ms ASC'
        );
        $stmt->execute([$config['user_key'], $store]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT `store`, item_key, payload_json, updated_at_ms
             FROM patzer_sync_items
             WHERE user_key = ? AND `store` = ? AND updated_at_ms > ?
             ORDER BY updated_at_ms ASC'
        );
        $stmt->execute([$config['user_key'], $store, $since]);
    }

    while ($row = $stmt->fetch()) {
        $payload = json_decode((string) $row['payload_json'], true);
        if ($payload === null && json_last_error() !== JSON_ERROR_NONE) continue;
        $items[] = [
            'store' => $row['store'],
            'itemKey' => $row['item_key'],
            'updatedAt' => (int) $row['updated_at_ms'],
            'payload' => $payload,
        ];
    }
}

patzer_json(200, ['ok' => true, 'items' => $items]);

