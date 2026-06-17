<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);

$meta = patzer_bump_generation($pdo, $config['user_key'], 'manual-invalidate');

patzer_json(200, [
    'ok' => true,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
