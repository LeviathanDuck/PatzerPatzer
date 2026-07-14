<?php
declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$config = patzer_require_admin();
$pdo = patzer_db($config);
$secret = patzer_book_token_secret($config);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$userKey = $config['user_key'];

if ($method === 'GET') {
    $row = patzer_book_auth_row($pdo, $userKey);
    if ($row && patzer_book_auth_expired($row)) $row = null;
    patzer_json(200, [
        'ok' => true,
        'connected' => $row !== null,
        'username' => $row ? (string) $row['lichess_username'] : null,
        'updatedAt' => $row ? (int) $row['updated_at_ms'] : null,
    ]);
}

if ($method !== 'POST') {
    patzer_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

$body = patzer_read_json_body();
$action = $body['action'] ?? '';
if (!is_string($action)) {
    patzer_json(400, ['ok' => false, 'error' => 'Book auth action is required.']);
}
if ($action !== 'save' && $action !== 'disconnect') {
    patzer_json(400, ['ok' => false, 'error' => 'Unsupported book auth action.']);
}

// Optional fast rejection only. Each credential mutation repeats the authoritative generation
// comparison while holding the meta row in the same transaction as the book-row write.
patzer_require_fresh_generation($pdo, $config);

if ($action === 'disconnect') {
    try {
        $pdo->beginTransaction();
        patzer_require_locked_fresh_generation($pdo, $config);
        $delete = $pdo->prepare('DELETE FROM patzer_book_auth WHERE user_key = ?');
        $delete->execute([$userKey]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_json(500, ['ok' => false, 'error' => 'Could not disconnect Lichess book access.']);
    }
    patzer_json(200, ['ok' => true, 'connected' => false]);
}

$username = $body['username'] ?? '';
$token = $body['token'] ?? '';
if (!is_string($username) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $username)) {
    patzer_json(400, ['ok' => false, 'error' => 'Invalid Lichess username.']);
}
if (!is_string($token) || strlen($token) < 12 || strlen($token) > 4096) {
    patzer_json(400, ['ok' => false, 'error' => 'Invalid Lichess token.']);
}

$expiresAtRaw = $body['expiresAt'] ?? $body['expires_at_ms'] ?? null;
$expiresAt = null;
if ($expiresAtRaw !== null) {
    if (!is_numeric($expiresAtRaw)) patzer_json(400, ['ok' => false, 'error' => 'Invalid token expiration.']);
    $expiresAt = max(0, (int) $expiresAtRaw);
}

$encrypted = patzer_encrypt_book_token($token, $secret);
$now = patzer_now_ms();
try {
    $pdo->beginTransaction();
    patzer_require_locked_fresh_generation($pdo, $config);
    $stmt = $pdo->prepare(
        'INSERT INTO patzer_book_auth
           (user_key, lichess_username, token_ciphertext, token_iv, token_tag, token_expires_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           lichess_username = VALUES(lichess_username),
           token_ciphertext = VALUES(token_ciphertext),
           token_iv = VALUES(token_iv),
           token_tag = VALUES(token_tag),
           token_expires_at_ms = VALUES(token_expires_at_ms),
           updated_at_ms = VALUES(updated_at_ms)'
    );
    $stmt->execute([
        $userKey,
        $username,
        $encrypted['ciphertext'],
        $encrypted['iv'],
        $encrypted['tag'],
        $expiresAt,
        $now,
    ]);
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    patzer_json(500, ['ok' => false, 'error' => 'Could not save Lichess book access.']);
}

patzer_json(200, [
    'ok' => true,
    'connected' => true,
    'username' => $username,
    'updatedAt' => $now,
]);
