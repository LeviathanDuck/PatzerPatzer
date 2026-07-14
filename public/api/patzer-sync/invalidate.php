<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
patzer_require_fresh_generation($pdo, $config);

$pdo->beginTransaction();
try {
    patzer_require_locked_fresh_generation($pdo, $config);
    $meta = patzer_bump_generation($pdo, $config['user_key'], 'manual-invalidate');
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Sync invalidation failed.']);
}

patzer_json(200, [
    'ok' => true,
    'syncGeneration' => $meta['syncGeneration'],
    'generationReason' => $meta['generationReason'],
]);
