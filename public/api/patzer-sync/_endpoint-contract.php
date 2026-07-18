<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_auth.php';

function patzer_operation_registry(): array {
    static $registry = null;
    if ($registry !== null) return $registry;
    $r = static fn(string $id,string $file,?string $action,array $methods,string $capability,string $scope,bool $csrf=false,string $disposition='enabled'): array => [
        'operationId'=>$id,'endpoint'=>$file,'action'=>$action,'methods'=>$methods,'allow'=>implode(', ', $methods),
        'authTypes'=>['legacy-bearer-v1','session-v1'],'capability'=>$capability,'scope'=>$scope,'cookieCsrf'=>$csrf,
        'disposition'=>$disposition,'denial'=>'stable-v1',
    ];
    $registry = ['version' => 'patzer-access-v1', 'operations' => [
        'S01'=>$r('S01','status.php',null,['GET','HEAD'],'sync.status-own','self'),
        'S02'=>$r('S02','pull.php',null,['GET','HEAD'],'sync.read-own','self'),
        'S03'=>$r('S03','export.php',null,['GET','HEAD'],'sync.export-own','self'),
        'S04'=>$r('S04','push.php',null,['POST'],'sync.write-own','self',true),
        'S05'=>$r('S05','invalidate.php',null,['POST'],'sync.invalidate-own','self',true),
        'S06'=>$r('S06','data-management-delete.php',null,['POST'],'sync.recovery-destructive-own','self',true),
        'S07'=>$r('S07','restore-start.php',null,['POST'],'sync.recovery-destructive-own','self',true),
        'S08'=>$r('S08','restore-chunk.php',null,['POST'],'sync.recovery-destructive-own','self',true),
        'S09'=>$r('S09','restore-commit.php',null,['POST'],'sync.recovery-destructive-own','self',true),
        'B01'=>$r('B01','book-auth.php','status',['GET','HEAD'],'book.read-own','self'),
        'B02'=>$r('B02','book-auth.php','save',['POST'],'book.manage-own','self',true),
        'B03'=>$r('B03','book-auth.php','disconnect',['POST'],'book.manage-own','self',true),
        'B04'=>$r('B04','book-explorer.php',null,['GET','HEAD'],'book.read-own','self'),
        'B05'=>$r('B05','book-import.php',null,['POST'],'book.manage-own','self',true),
        'A01'=>$r('A01','invite-activate.php',null,['POST'],'','invite-proof',false,'session-lifecycle'),
        'A02'=>$r('A02','session-status.php',null,['GET','HEAD'],'','session-only',false,'session-lifecycle'),
        'A03'=>$r('A03','session-logout.php',null,['POST'],'','session-only',true,'session-lifecycle'),
    ]];
    return $registry;
}

function patzer_operation_for_request(string $endpoint): string {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($endpoint === 'book-auth.php') {
        if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) {
            header('Allow: GET, HEAD, POST');
            patzer_json(405, ['ok'=>false,'error'=>'method-not-allowed']);
        }
        if ($method === 'GET' || $method === 'HEAD') {
            $action = $_GET['action'] ?? 'status';
        } else {
            $raw = file_get_contents('php://input');
            $body = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($body)) patzer_json(404, ['ok'=>false,'error'=>'operation-not-found']);
            $action = $body['action'] ?? null;
        }
        if ($action === 'status') return 'B01';
        if ($action === 'save') return 'B02';
        if ($action === 'disconnect') return 'B03';
        patzer_json(404, ['ok'=>false,'error'=>'operation-not-found']);
    }
    foreach (patzer_operation_registry()['operations'] as $id => $row) if ($row['endpoint'] === $endpoint && $row['action'] === null) return $id;
    patzer_json(404, ['ok'=>false,'error'=>'operation-not-found']);
}

function patzer_require_operation(string $operationId): array {
    $registry = patzer_operation_registry();
    $operation = $registry['operations'][$operationId] ?? null;
    if (!is_array($operation) || count(array_diff(['operationId','endpoint','methods','allow','authTypes','capability','scope','cookieCsrf','disposition','denial'], array_keys($operation))) > 0 ||
        $operation['operationId'] !== $operationId) {
        patzer_json(404, ['ok' => false, 'error' => 'operation-not-found']);
    }
    if (basename((string)($_SERVER['SCRIPT_NAME'] ?? '')) !== $operation['endpoint']) {
        patzer_json(404, ['ok' => false, 'error' => 'operation-not-found']);
    }
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, $operation['methods'], true)) {
        header('Allow: ' . $operation['allow']);
        patzer_json(405, ['ok'=>false,'error'=>'method-not-allowed']);
    }
    if ($operation['disposition'] === 'unclassified') patzer_json(404, ['ok'=>false,'error'=>'operation-not-found']);
    if (substr($operationId, 0, 1) === 'A') {
        patzer_session_require_https();
        $config = patzer_session_request_config($operationId === 'A03');
        if ($operationId === 'A01') return $config;
        $context = $config['auth_context'];
        if ($operationId === 'A03' && patzer_verify_cookie_mutation($context, $config) !== true) {
            patzer_json(403, ['ok'=>false,'error'=>'cookie-origin-csrf-required']);
        }
        if ($operationId === 'A02') $config['auth_public_context'] = patzer_session_public_context($context, $config);
        if ($operationId !== 'A01') $config = patzer_session_scrub_verified_post($config);
        if ($method === 'HEAD') ob_start(static fn(string $buffer): string => '');
        return $config;
    }
    $config = patzer_authenticate_request();
    $context = $config['auth_context'];
    if (!in_array($context['authType'], $operation['authTypes'], true)) patzer_auth_denied();
    if ($context['authType'] === 'session-v1') {
        if ($method === 'POST') {
            if (!$operation['cookieCsrf'] || !function_exists('patzer_verify_cookie_mutation') || patzer_verify_cookie_mutation($context, $config) !== true) {
                patzer_json(403, ['ok'=>false,'error'=>'cookie-origin-csrf-required']);
            }
        }
    }
    $config = patzer_session_scrub_verified_post($config);
    $context = $config['auth_context'];
    if ($operation['disposition'] === 'legacy-write-disabled') patzer_json(403, ['ok'=>false,'error'=>'legacy-diagnostics-write-disabled']);
    if (!in_array($operation['capability'], $context['capabilities'], true)) patzer_json(403, ['ok'=>false,'error'=>'capability-denied']);
    $scope = $context['scopes'][$operation['capability']] ?? null;
    if (!is_array($scope) || ($scope['kind'] ?? null) !== $operation['scope']) patzer_json(403, ['ok'=>false,'error'=>'scope-denied']);
    if ($method === 'HEAD') ob_start(static fn(string $buffer): string => '');
    return $config;
}
