<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$stmt = $pdo->prepare('SELECT COUNT(*) AS count FROM patzer_sync_items WHERE user_key = ?');
$stmt->execute([$config['user_key']]);
$row = $stmt->fetch();

patzer_json(200, [
    'ok' => true,
    'userKey' => $config['user_key'],
    'items' => isset($row['count']) ? (int) $row['count'] : 0,
]);

