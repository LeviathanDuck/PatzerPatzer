<?php
declare(strict_types=1);
require_once __DIR__ . '/_endpoint-contract.php';
$config = patzer_require_operation('A03');
patzer_session_logout($config);
