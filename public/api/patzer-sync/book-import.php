<?php
declare(strict_types=1);

require __DIR__ . '/_endpoint-contract.php';

// Relays a PGN import to the Lichess import API with the stored (encrypted) book access token,
// so the imported game is attributed to the connected Lichess account. The browser never sees
// the Lichess token; this mirrors the proxy pattern in book-explorer.php.

function patzer_proxy_import(string $pgn, string $token): never {
    $target = 'https://lichess.org/api/import';
    $payload = http_build_query(['pgn' => $pgn], '', '&', PHP_QUERY_RFC3986);
    $requestHeaders = [
        'Authorization: Bearer ' . $token,
        'User-Agent: ChessPatzer/1.0',
        'Accept: application/json',
        'Content-Type: application/x-www-form-urlencoded',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($target);
        if ($ch === false) patzer_json(500, ['ok' => false, 'error' => 'Could not initialize import proxy.']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $requestHeaders,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            patzer_json(502, ['ok' => false, 'error' => 'Import proxy failed: ' . ($error ?: 'unknown error')]);
        }
        http_response_code($status >= 100 ? $status : 502);
        header('Content-Type: ' . ($contentType !== '' ? $contentType : 'application/json; charset=utf-8'), true);
        echo $body;
        exit;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $requestHeaders) . "\r\n",
            'content' => $payload,
            'ignore_errors' => true,
            'timeout' => 30,
        ],
    ]);
    $body = file_get_contents($target, false, $context);
    if ($body === false) {
        patzer_json(502, ['ok' => false, 'error' => 'Import proxy failed.']);
    }
    $headers = [];
    if (function_exists('http_get_last_response_headers')) {
        $lastHeaders = http_get_last_response_headers();
        if (is_array($lastHeaders)) $headers = $lastHeaders;
    }
    $status = 502;
    $responseContentType = 'application/json; charset=utf-8';
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', (string) $header, $matches)) {
            $status = (int) $matches[1];
        }
        if (stripos((string) $header, 'Content-Type:') === 0) {
            $value = trim(substr((string) $header, strlen('Content-Type:')));
            if ($value !== '') $responseContentType = $value;
        }
    }
    http_response_code($status);
    header('Content-Type: ' . $responseContentType, true);
    echo $body;
    exit;
}

$config = patzer_require_operation('B05');
$pdo = $config['request_pdo'];
$secret = patzer_book_token_secret($config);
$userKey = $config['user_key'];

$row = patzer_book_auth_row($pdo, $userKey);
if (!$row) {
    patzer_json(401, ['ok' => false, 'error' => 'Lichess book access is not connected.']);
}
if (patzer_book_auth_expired($row)) {
    patzer_json(401, ['ok' => false, 'error' => 'Lichess book access has expired.']);
}

$body = patzer_read_json_body();
$pgn = $body['pgn'] ?? '';
if (!is_string($pgn) || trim($pgn) === '') {
    patzer_json(400, ['ok' => false, 'error' => 'A PGN is required.']);
}
if (strlen($pgn) > 262144) {
    patzer_json(400, ['ok' => false, 'error' => 'PGN is too large to import.']);
}

patzer_proxy_import($pgn, patzer_decrypt_book_token($row, $secret));
