<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

function patzer_explorer_db(): string {
    $db = $_GET['db'] ?? '';
    if (!is_string($db) || !in_array($db, ['masters', 'lichess', 'player'], true)) {
        patzer_json(400, ['ok' => false, 'error' => 'Unsupported explorer database.']);
    }
    return $db;
}

function patzer_upstream_status_from_headers(array $headers): int {
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', (string) $header, $matches)) {
            return (int) $matches[1];
        }
    }
    return 502;
}

function patzer_upstream_content_type_from_headers(array $headers): string {
    foreach ($headers as $header) {
        if (stripos((string) $header, 'Content-Type:') === 0) {
            $value = trim(substr((string) $header, strlen('Content-Type:')));
            if ($value !== '') return $value;
        }
    }
    return 'application/x-ndjson; charset=utf-8';
}

function patzer_proxy_explorer(string $target, string $token): never {
    $requestHeaders = [
        'Authorization: Bearer ' . $token,
        'User-Agent: PatzerPro/1.0',
        'Accept: application/x-ndjson, application/json;q=0.9',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($target);
        if ($ch === false) patzer_json(500, ['ok' => false, 'error' => 'Could not initialize explorer proxy.']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => $requestHeaders,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            patzer_json(502, ['ok' => false, 'error' => 'Explorer proxy failed: ' . ($error ?: 'unknown error')]);
        }
        http_response_code($status >= 100 ? $status : 502);
        header('Content-Type: ' . ($contentType !== '' ? $contentType : 'application/x-ndjson; charset=utf-8'), true);
        echo $body;
        exit;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $requestHeaders) . "\r\n",
            'ignore_errors' => true,
            'timeout' => 30,
        ],
    ]);
    $body = file_get_contents($target, false, $context);
    if ($body === false) {
        patzer_json(502, ['ok' => false, 'error' => 'Explorer proxy failed.']);
    }
    $headers = [];
    if (function_exists('http_get_last_response_headers')) {
        $lastHeaders = http_get_last_response_headers();
        if (is_array($lastHeaders)) $headers = $lastHeaders;
    }
    http_response_code(patzer_upstream_status_from_headers($headers));
    header('Content-Type: ' . patzer_upstream_content_type_from_headers($headers), true);
    echo $body;
    exit;
}

$config = patzer_require_admin();
$pdo = patzer_db($config);
$secret = patzer_book_token_secret($config);
$userKey = $config['user_key'];
$row = patzer_book_auth_row($pdo, $userKey);
if (!$row) {
    patzer_json(401, ['ok' => false, 'error' => 'Lichess book access is not connected.']);
}
if (patzer_book_auth_expired($row)) {
    patzer_json(401, ['ok' => false, 'error' => 'Lichess book access has expired.']);
}

$db = patzer_explorer_db();
$query = $_GET;
unset($query['db']);
$qs = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
$target = 'https://explorer.lichess.ovh/' . $db . ($qs !== '' ? '?' . $qs : '');

patzer_proxy_explorer($target, patzer_decrypt_book_token($row, $secret));
