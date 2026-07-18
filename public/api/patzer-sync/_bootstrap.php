<?php
declare(strict_types=1);

require __DIR__ . '/generated-manifest.php';

// PHP handlers do not uniformly preserve parent .htaccess response headers (notably CGI/FastCGI
// internal redirects). Keep API responses on the same security baseline and let the local HTTPS
// gate compare this value byte-for-byte with the static-resource policy.
header_remove('X-Powered-By');
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Embedder-Policy: require-corp');
if (in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')), ['on','1'], true)) {
    header('Strict-Transport-Security: max-age=86400');
}
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
header("Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-nfG96u9RzFQe9nKe5rrXq7T18qRV47Vg610Y9JXB2pc='; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' https://lichess.org https://api.chess.com https://explorer.lichess.ovh https://tablebase.lichess.ovh; img-src 'self' data: blob: https://images.chesscomfiles.com; font-src 'self' data:; manifest-src 'self'; frame-src 'none'; upgrade-insecure-requests");
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Sync store names are persisted in MySQL and are compatibility contracts.
// The generated manifest keeps this list aligned with TypeScript consumers.
// Do not rename or remove a store without an explicit live-data migration.
define('PATZER_ALLOWED_STORES', PATZER_SYNC_MANIFEST_STORES);






define('PATZER_RESTORE_HASH_CONTRACT', 'exact-payload-json-v1');








define('PATZER_RESTORE_CHUNK_MAX_BYTES', 33554432);       // 32 MiB per restore-chunk request body
define('PATZER_RESTORE_ITEM_PAYLOAD_MAX_BYTES', 8388608); // 8 MiB per item payloadJson string

function patzer_json(int $status, array $payload): never {
    http_response_code($status);
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'HEAD') {
        echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function patzer_bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) return null;
    $token = trim($matches[1]);
    return $token === '' ? null : $token;
}

function patzer_config_string(array $config, string $key): string {
    if (!array_key_exists($key, $config) || !is_string($config[$key]) || $config[$key] === '') {
        patzer_json(500, ['ok' => false, 'error' => "Patzer sync config key {$key} is missing."]);
    }
    return $config[$key];
}

function patzer_config_token_hash($value, string $key): string {
    if (!is_string($value) || preg_match('/\A[a-f0-9]{64}\z/i', $value) !== 1) {
        patzer_json(500, ['ok' => false, 'error' => "Patzer sync config key {$key} must be a SHA-256 hex token hash."]);
    }
    return strtolower($value);
}

function patzer_config_user_key($value, string $key): string {
    if (!is_string($value) || trim($value) === '') {
        patzer_json(500, ['ok' => false, 'error' => "Patzer sync config key {$key} is missing."]);
    }
    $userKey = trim($value);
    if (strlen($userKey) > 128) {
        patzer_json(500, ['ok' => false, 'error' => "Patzer sync config key {$key} is too long."]);
    }
    return $userKey;
}

function patzer_sync_token_identities(array $config): array {
    if (!array_key_exists('sync_tokens', $config)) {
        return [[
            'identity' => 'legacy',
            'token_hash' => patzer_config_token_hash($config['sync_token_hash'] ?? null, 'sync_token_hash'),
            'user_key' => patzer_config_user_key($config['user_key'] ?? 'admin-beta', 'user_key'),
        ]];
    }

    if (!is_array($config['sync_tokens']) || count($config['sync_tokens']) === 0) {
        patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config key sync_tokens must contain at least one token identity.']);
    }

    $identities = [];
    $seenHashes = [];
    $seenUserKeys = [];
    foreach ($config['sync_tokens'] as $identity => $entry) {
        if (!is_array($entry)) {
            patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config sync_tokens entries must be arrays.']);
        }
        $identityName = is_string($identity) ? trim($identity) : trim((string) ($entry['identity'] ?? ''));
        if ($identityName === '') {
            patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config sync_tokens entries need identity names.']);
        }

        $tokenHash = patzer_config_token_hash($entry['token_hash'] ?? null, "sync_tokens.{$identityName}.token_hash");
        $userKey = patzer_config_user_key($entry['user_key'] ?? null, "sync_tokens.{$identityName}.user_key");
        if (isset($seenHashes[$tokenHash])) {
            patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config sync_tokens has duplicate token hashes.']);
        }
        if (isset($seenUserKeys[$userKey])) {
            patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config sync_tokens must map each identity to a distinct user_key.']);
        }

        $seenHashes[$tokenHash] = true;
        $seenUserKeys[$userKey] = true;
        $identities[] = [
            'identity' => $identityName,
            'token_hash' => $tokenHash,
            'user_key' => $userKey,
            'compat_capabilities' => $entry['compat_capabilities'] ?? null,
            'compat_tier' => $entry['compat_tier'] ?? null,
        ];
    }
    return $identities;
}

function patzer_config(): array {
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        patzer_json(500, [
            'ok' => false,
            'error' => 'Patzer sync config.php is missing on the server.',
        ]);
    }
    $config = require $path;
    if (!is_array($config)) {
        patzer_json(500, ['ok' => false, 'error' => 'Patzer sync config.php did not return an array.']);
    }
    foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $key) patzer_config_string($config, $key);
    patzer_sync_token_identities($config);
    return $config;
}

function patzer_db(array $config): PDO {
    $pdo = patzer_db_request($config);
    patzer_ensure_schema($pdo);
    return $pdo;
}

// Serving paths use this connection primitive. It deliberately performs no DDL or repair;
// schema installation is an operator/migration concern, never a request side effect.
function patzer_db_request(array $config): PDO {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );
    try {
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $error) {
        patzer_json(500, ['ok' => false, 'error' => 'Database connection failed.']);
    }
    return $pdo;
}

// Bump this constant whenever patzer_run_schema_checks()'s DDL/probe body changes. A higher
// constant than the stored marker forces exactly one full INFORMATION_SCHEMA + DDL check pass
// (across all requests, serialized by whichever request gets there first) before the marker is
// rewritten and the hot path resumes skipping the probes.
define('PATZER_SCHEMA_REVISION', 1);

function patzer_ensure_schema(PDO $pdo): void {
    if (patzer_schema_state_revision($pdo) >= PATZER_SCHEMA_REVISION) return;
    patzer_run_schema_checks($pdo);
    patzer_mark_schema_state_revision($pdo, PATZER_SCHEMA_REVISION);
}

// Least-invasive storage for the schema-revision marker: a dedicated one-row table
// (patzer_schema_state) rather than overloading patzer_sync_meta's per-user sync_generation
// column, which already carries CAS/stale-session semantics unrelated to DDL bookkeeping.
function patzer_schema_state_revision(PDO $pdo): int {
    try {
        $stmt = $pdo->prepare('SELECT schema_revision FROM patzer_schema_state WHERE id = 1 LIMIT 1');
        $stmt->execute();
        $row = $stmt->fetch();
        return is_array($row) && isset($row['schema_revision']) ? (int) $row['schema_revision'] : 0;
    } catch (Throwable $error) {
        // Table doesn't exist yet (fresh install) or the query failed: fall back to 0 so the
        // full check pass runs and creates/repairs the marker table itself.
        return 0;
    }
}

function patzer_mark_schema_state_revision(PDO $pdo, int $revision): void {
    $stmt = $pdo->prepare(
        'INSERT INTO patzer_schema_state (id, schema_revision)
         VALUES (1, ?)
         ON DUPLICATE KEY UPDATE schema_revision = VALUES(schema_revision)'
    );
    $stmt->execute([$revision]);
}

function patzer_run_schema_checks(PDO $pdo): void {
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS patzer_schema_state (
            id TINYINT UNSIGNED NOT NULL,
            schema_revision INT UNSIGNED NOT NULL DEFAULT 0,
            server_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS patzer_sync_items (
            user_key VARCHAR(128) NOT NULL,
            `store` VARCHAR(64) NOT NULL,
            item_key VARCHAR(255) NOT NULL,
            version BIGINT UNSIGNED NOT NULL DEFAULT 0,
            payload_json LONGTEXT NULL,
            updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
            deleted_at_ms BIGINT UNSIGNED NULL DEFAULT NULL,
            server_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_key, `store`, item_key),
            INDEX idx_patzer_sync_user_store_updated (user_key, `store`, updated_at_ms),
            INDEX idx_patzer_sync_user_version (user_key, version),
            INDEX idx_patzer_sync_user_store_version (user_key, `store`, version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS patzer_sync_meta (
            user_key VARCHAR(128) NOT NULL,
            sync_generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
            sync_version_next BIGINT UNSIGNED NOT NULL DEFAULT 1,
            generation_reason VARCHAR(64) NOT NULL DEFAULT \'initial\',
            updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
            server_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS patzer_sync_restore_items (
            restore_id VARCHAR(64) NOT NULL,
            user_key VARCHAR(128) NOT NULL,
            `store` VARCHAR(64) NOT NULL,
            item_key VARCHAR(255) NOT NULL,
            source_version BIGINT UNSIGNED NULL DEFAULT NULL,
            payload_json LONGTEXT NULL,
            updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
            deleted_at_ms BIGINT UNSIGNED NULL DEFAULT NULL,
            server_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (restore_id, user_key, `store`, item_key),
            INDEX idx_patzer_restore_user (user_key, restore_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS patzer_book_auth (
            user_key VARCHAR(128) NOT NULL,
            lichess_username VARCHAR(80) NOT NULL,
            token_ciphertext TEXT NOT NULL,
            token_iv VARCHAR(64) NOT NULL,
            token_tag VARCHAR(64) NOT NULL,
            token_expires_at_ms BIGINT UNSIGNED NULL DEFAULT NULL,
            updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
            server_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    patzer_ensure_nullable_payload($pdo);
    patzer_ensure_column($pdo, 'version', 'ADD COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER item_key');
    patzer_ensure_column($pdo, 'deleted_at_ms', 'ADD COLUMN deleted_at_ms BIGINT UNSIGNED NULL DEFAULT NULL AFTER updated_at_ms');
    patzer_ensure_column($pdo, 'sync_version_next', 'ADD COLUMN sync_version_next BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER sync_generation', 'patzer_sync_meta');
    patzer_ensure_column($pdo, 'source_version', 'ADD COLUMN source_version BIGINT UNSIGNED NULL DEFAULT NULL AFTER item_key', 'patzer_sync_restore_items');
    patzer_ensure_index($pdo, 'patzer_sync_items', 'idx_patzer_sync_user_version', 'CREATE INDEX idx_patzer_sync_user_version ON patzer_sync_items (user_key, version)');
    patzer_ensure_index($pdo, 'patzer_sync_items', 'idx_patzer_sync_user_store_version', 'CREATE INDEX idx_patzer_sync_user_store_version ON patzer_sync_items (user_key, `store`, version)');
}

function patzer_ensure_nullable_payload(PDO $pdo): void {
    $column = patzer_column_metadata($pdo, 'payload_json');
    if (!$column) return;
    if (($column['Null'] ?? '') !== 'YES') {
        $pdo->exec('ALTER TABLE patzer_sync_items MODIFY payload_json LONGTEXT NULL');
    }
}

function patzer_ensure_column(PDO $pdo, string $column, string $alterSql, string $table = 'patzer_sync_items'): void {
    patzer_assert_schema_table_column($table, $column);
    $exists = patzer_column_metadata($pdo, $column, $table);
    if ($exists) return;
    try {
        $pdo->exec('ALTER TABLE ' . $table . ' ' . $alterSql);
    } catch (PDOException $error) {
        $info = $error->errorInfo;
        $driverCode = isset($info[1]) ? (int) $info[1] : 0;
        if ($driverCode === 1060) return;
        throw $error;
    }
}

function patzer_column_metadata(PDO $pdo, string $column, string $table = 'patzer_sync_items'): ?array {
    patzer_assert_schema_table_column($table, $column);
    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME, IS_NULLABLE AS `Null`
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $column]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function patzer_assert_schema_table_column(string $table, string $column): void {
    static $allowed = [
        'patzer_sync_items' => ['payload_json', 'deleted_at_ms', 'version'],
        'patzer_sync_meta' => ['sync_version_next'],
        'patzer_sync_restore_items' => ['source_version'],
    ];
    if (!isset($allowed[$table]) || !in_array($column, $allowed[$table], true)) {
        patzer_json(500, ['ok' => false, 'error' => 'Unsupported schema column check.']);
    }
}

function patzer_ensure_index(PDO $pdo, string $table, string $index, string $createSql): void {
    patzer_assert_schema_index($table, $index);
    if (patzer_index_exists($pdo, $table, $index)) return;
    try {
        $pdo->exec($createSql);
    } catch (PDOException $error) {
        $info = $error->errorInfo;
        $driverCode = isset($info[1]) ? (int) $info[1] : 0;
        if ($driverCode === 1061) return;
        throw $error;
    }
}

function patzer_index_exists(PDO $pdo, string $table, string $index): bool {
    patzer_assert_schema_index($table, $index);
    $stmt = $pdo->prepare(
        'SELECT 1
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?
         LIMIT 1'
    );
    $stmt->execute([$table, $index]);
    return (bool) $stmt->fetchColumn();
}

function patzer_assert_schema_index(string $table, string $index): void {
    static $allowed = [
        'patzer_sync_items' => [
            'idx_patzer_sync_user_version',
            'idx_patzer_sync_user_store_version',
        ],
    ];
    if (!isset($allowed[$table]) || !in_array($index, $allowed[$table], true)) {
        patzer_json(500, ['ok' => false, 'error' => 'Unsupported schema index check.']);
    }
}

function patzer_sync_schema_checks(PDO $pdo): array {
    return [
        'itemsVersionColumn' => patzer_column_metadata($pdo, 'version') !== null,
        'metaSyncVersionNextColumn' => patzer_column_metadata($pdo, 'sync_version_next', 'patzer_sync_meta') !== null,
        'restoreSourceVersionColumn' => patzer_column_metadata($pdo, 'source_version', 'patzer_sync_restore_items') !== null,
        'itemsUserVersionIndex' => patzer_index_exists($pdo, 'patzer_sync_items', 'idx_patzer_sync_user_version'),
        'itemsUserStoreVersionIndex' => patzer_index_exists($pdo, 'patzer_sync_items', 'idx_patzer_sync_user_store_version'),
    ];
}

// Null keeps the historical unlimited behavior for existing
// endpoints; restore-chunk passes PATZER_RESTORE_CHUNK_MAX_BYTES.
//
// Bounding semantics: the ceiling guarantees rejection BEFORE json_decode, not before body
// allocation. The CONTENT_LENGTH pre-check can refuse an oversized body before it is read here,
// but when that header is absent or the transfer is chunked, php://input has already been
// materialized by the runtime and the strlen check only prevents the (larger) decode step.
// The hard pre-allocation backstop remains PHP's own post_max_size/memory limits.
function patzer_read_json_body(?int $maxBytes = null): array {
    if ($maxBytes !== null) {
        $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
        if ($length > $maxBytes) {
            patzer_json(413, ['ok' => false, 'error' => 'Request body is too large.']);
        }
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    if ($maxBytes !== null && strlen($raw) > $maxBytes) {
        patzer_json(413, ['ok' => false, 'error' => 'Request body is too large.']);
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) patzer_json(400, ['ok' => false, 'error' => 'Invalid JSON body.']);
    return $body;
}

function patzer_now_ms(): int {
    return (int) floor(microtime(true) * 1000);
}

function patzer_sync_meta(PDO $pdo, string $userKey): array {
    $now = patzer_now_ms();
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO patzer_sync_meta (user_key, sync_generation, generation_reason, updated_at_ms)
         VALUES (?, 1, \'initial\', ?)'
    );
    $stmt->execute([$userKey, $now]);

    $read = $pdo->prepare(
        'SELECT sync_generation, sync_version_next, generation_reason, updated_at_ms
         FROM patzer_sync_meta
         WHERE user_key = ?
         LIMIT 1'
    );
    $read->execute([$userKey]);
    $row = $read->fetch();
    $read->closeCursor();
    if (!is_array($row)) {
        return ['syncGeneration' => 1, 'syncVersionNext' => 1, 'generationReason' => 'initial', 'updatedAtMs' => $now];
    }
    return [
        'syncGeneration' => isset($row['sync_generation']) ? (int) $row['sync_generation'] : 1,
        'syncVersionNext' => isset($row['sync_version_next']) ? (int) $row['sync_version_next'] : 1,
        'generationReason' => is_string($row['generation_reason'] ?? null) ? (string) $row['generation_reason'] : 'initial',
        'updatedAtMs' => isset($row['updated_at_ms']) ? (int) $row['updated_at_ms'] : 0,
    ];
}

function patzer_sync_meta_read(PDO $pdo, string $userKey): array {
    $read = $pdo->prepare(
        'SELECT sync_generation, sync_version_next, generation_reason, updated_at_ms
         FROM patzer_sync_meta WHERE user_key = ? LIMIT 1'
    );
    $read->execute([$userKey]);
    $row = $read->fetch();
    $read->closeCursor();
    if (!is_array($row)) return ['syncGeneration'=>1,'syncVersionNext'=>1,'generationReason'=>'initial','updatedAtMs'=>0];
    return [
        'syncGeneration'=>(int)($row['sync_generation'] ?? 1),
        'syncVersionNext'=>max(1,(int)($row['sync_version_next'] ?? 1)),
        'generationReason'=>(string)($row['generation_reason'] ?? 'initial'),
        'updatedAtMs'=>(int)($row['updated_at_ms'] ?? 0),
    ];
}

function patzer_require_fresh_generation_read(PDO $pdo, array $config): array {
    $meta = patzer_sync_meta_read($pdo, $config['user_key']);
    $provided = patzer_generation_header();
    if ($provided === null || $provided !== $meta['syncGeneration']) {
        patzer_json(409, ['ok'=>false,'code'=>'stale-session','error'=>'This browser session is stale. Re-enter the admin token and pull before pushing.','syncGeneration'=>$meta['syncGeneration'],'generationReason'=>$meta['generationReason']]);
    }
    return $meta;
}

function patzer_take_next_sync_version(PDO $pdo, string $userKey): int {
    patzer_sync_meta($pdo, $userKey);
    $read = $pdo->prepare(
        'SELECT sync_version_next
         FROM patzer_sync_meta
         WHERE user_key = ?
         LIMIT 1
         FOR UPDATE'
    );
    $read->execute([$userKey]);
    $row = $read->fetch();
    $read->closeCursor();
    $next = isset($row['sync_version_next']) ? max(1, (int) $row['sync_version_next']) : 1;
    $update = $pdo->prepare(
        'UPDATE patzer_sync_meta
         SET sync_version_next = ?
         WHERE user_key = ?'
    );
    $update->execute([$next + 1, $userKey]);
    return $next;
}

function patzer_generation_header(): ?int {
    $header = $_SERVER['HTTP_X_PATZER_SYNC_GENERATION'] ?? $_SERVER['REDIRECT_HTTP_X_PATZER_SYNC_GENERATION'] ?? '';
    if (!is_string($header) || trim($header) === '') return null;
    if (!preg_match('/^\d+$/', trim($header))) return null;
    return (int) trim($header);
}

function patzer_require_fresh_generation(PDO $pdo, array $config): array {
    // Admission is read-only so missing/stale generation failures cannot create metadata.
    // A fresh write may initialize its row only after the request generation is accepted.
    $meta = patzer_sync_meta_read($pdo, $config['user_key']);
    $provided = patzer_generation_header();
    if ($provided === null || $provided !== $meta['syncGeneration']) {
        patzer_json(409, [
            'ok' => false,
            'code' => 'stale-session',
            'error' => 'This browser session is stale. Re-enter the admin token and pull before pushing.',
            'syncGeneration' => $meta['syncGeneration'],
            'generationReason' => $meta['generationReason'],
        ]);
    }
    return patzer_sync_meta($pdo, $config['user_key']);
}

// Authoritative mutation gate. The outer patzer_require_fresh_generation() call is only a fast
// rejection; correctness comes from comparing the request header while this transaction owns the
// user's meta-row lock. Callers must acquire this lock before any item, restore-stage, or book row.
function patzer_require_locked_fresh_generation(PDO $pdo, array $config): array {
    if (!$pdo->inTransaction()) {
        patzer_json(500, ['ok' => false, 'error' => 'Transactional generation validation requires an active transaction.']);
    }

    $now = patzer_now_ms();
    $ensure = $pdo->prepare(
        'INSERT IGNORE INTO patzer_sync_meta (user_key, sync_generation, generation_reason, updated_at_ms)
         VALUES (?, 1, \'initial\', ?)'
    );
    $ensure->execute([$config['user_key'], $now]);

    $read = $pdo->prepare(
        'SELECT sync_generation, sync_version_next, generation_reason, updated_at_ms
         FROM patzer_sync_meta
         WHERE user_key = ?
         LIMIT 1
         FOR UPDATE'
    );
    $read->execute([$config['user_key']]);
    $row = $read->fetch();
    $read->closeCursor();
    if (!is_array($row)) {
        $pdo->rollBack();
        patzer_json(500, ['ok' => false, 'error' => 'Transactional generation metadata is unavailable.']);
    }
    $lockedMeta = [
        'syncGeneration' => isset($row['sync_generation']) ? (int) $row['sync_generation'] : 1,
        'syncVersionNext' => isset($row['sync_version_next']) ? max(1, (int) $row['sync_version_next']) : 1,
        'generationReason' => is_string($row['generation_reason'] ?? null) ? (string) $row['generation_reason'] : 'initial',
        'updatedAtMs' => isset($row['updated_at_ms']) ? (int) $row['updated_at_ms'] : 0,
    ];
    $provided = patzer_generation_header();
    if ($provided === null || $provided !== $lockedMeta['syncGeneration']) { // PATZER_INNER_GENERATION_COMPARE
        $pdo->rollBack();
        patzer_json(409, [
            'ok' => false,
            'code' => 'stale-session',
            'error' => 'This browser session is stale. Re-enter the admin token and pull before pushing.',
            'syncGeneration' => $lockedMeta['syncGeneration'],
            'generationReason' => $lockedMeta['generationReason'],
        ]);
    }
    return $lockedMeta;
}

function patzer_bump_generation(PDO $pdo, string $userKey, string $reason): array {
    $now = patzer_now_ms();
    patzer_sync_meta($pdo, $userKey);
    $stmt = $pdo->prepare(
        'UPDATE patzer_sync_meta
         SET sync_generation = sync_generation + 1,
             generation_reason = ?,
             updated_at_ms = ?
         WHERE user_key = ?'
    );
    $stmt->execute([$reason, $now, $userKey]);
    return patzer_sync_meta($pdo, $userKey);
}

function patzer_restore_id(array $body): string {
    $restoreId = $body['restoreId'] ?? $body['restore_id'] ?? null;
    if (!is_string($restoreId) || !preg_match('/^[a-f0-9]{32}$/', $restoreId)) {
        patzer_json(400, ['ok' => false, 'error' => 'Invalid restore id.']);
    }
    return $restoreId;
}

function patzer_restore_hash_for_rows(array $rows): string {
    $ctx = hash_init('sha256');
    foreach ($rows as $row) {
        hash_update($ctx, (string) $row['store']);
        hash_update($ctx, "\0");
        hash_update($ctx, (string) $row['item_key']);
        hash_update($ctx, "\0");
        hash_update($ctx, (string) ((int) $row['updated_at_ms']));
        hash_update($ctx, "\0");
        hash_update($ctx, $row['deleted_at_ms'] === null ? '0' : '1');
        hash_update($ctx, "\0");
        hash_update($ctx, $row['payload_json'] === null ? '' : (string) $row['payload_json']);
        hash_update($ctx, "\n");
    }
    return hash_final($ctx);
}

function patzer_store_allowed(string $store): bool {
    return in_array($store, PATZER_ALLOWED_STORES, true);
}

function patzer_since(): ?int {
    if (!isset($_GET['since']) || $_GET['since'] === '') return null;
    if (!preg_match('/^\d+$/', (string) $_GET['since'])) return null;
    return (int) $_GET['since'];
}

function patzer_item_key(array $item): string {
    $key = $item['itemKey'] ?? $item['item_key'] ?? null;
    if (!is_string($key) || trim($key) === '') patzer_json(400, ['ok' => false, 'error' => 'Sync item is missing itemKey.']);
    return $key;
}

function patzer_item_store(array $item): string {
    $store = $item['store'] ?? null;
    if (!is_string($store) || !patzer_store_allowed($store)) {
        patzer_json(400, ['ok' => false, 'error' => 'Sync item has an unsupported store.']);
    }
    return $store;
}

function patzer_item_updated_at(array $item): int {
    $updated = $item['updatedAt'] ?? $item['updated_at_ms'] ?? 0;
    return is_numeric($updated) ? max(0, (int) $updated) : 0;
}

function patzer_item_deleted(array $item): bool {
    if (($item['deleted'] ?? false) === true) return true;
    return isset($item['operation']) && $item['operation'] === 'delete';
}

function patzer_item_payload(array $item): ?string {
    if (patzer_item_deleted($item)) return null;
    $payload = $item['payload'] ?? null;
    if ($payload === null) patzer_json(400, ['ok' => false, 'error' => 'Sync item is missing payload.']);
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) patzer_json(400, ['ok' => false, 'error' => 'Sync item payload could not be encoded.']);
    return $json;
}

// Restore-only payload staging helper (exact-payload-json-v1). Distinct from patzer_item_payload()
// because restore must NEVER re-encode a decoded object for hashing: it stages the exact transported
// bytes so the browser's expected hash and restore-commit's staged-row hash agree byte-for-byte.
//
//   * Tombstones stage NULL (patzer_restore_hash_for_rows frames deletions with an empty payload).
//   * When the negotiated exact-payload-json-v1 contract is active — signalled per item by the
//     presence of a `payloadJson` string — validate it is well-formed JSON via json_decode /
//     json_last_error AND that the decoded value satisfies BOTH live-payload rules the legacy
//     path enforces (patzer_item_payload rejects payload === null on a live row, and rejects a
//     payload json_encode cannot re-encode — e.g. 1e400 decoding to INF), then return the
//     ORIGINAL string UNCHANGED (no decode/re-encode round trip on the returned value, so
//     serialize_precision cannot perturb the staged/hashed bytes).
//     The decode is a validation GATE only; its result is never stored or hashed. Strings above
//     PATZER_RESTORE_ITEM_PAYLOAD_MAX_BYTES are rejected before the decode ever runs.
//   * Old clients that send only the decoded `payload` object fall back to patzer_item_payload().
//     This fallback is temporary for the rollout window and staging old-client payloads keeps the
//     compatibility path no worse than today.
function patzer_restore_item_payload(array $item): ?string {
    if (patzer_item_deleted($item)) return null;
    if (array_key_exists('payloadJson', $item)) {
        $payloadJson = $item['payloadJson'];
        if (!is_string($payloadJson)) {
            patzer_json(400, ['ok' => false, 'error' => 'Restore item payloadJson must be a JSON string.']);
        }
        if (strlen($payloadJson) > PATZER_RESTORE_ITEM_PAYLOAD_MAX_BYTES) {
            patzer_json(413, ['ok' => false, 'error' => 'Restore item payloadJson is too large.']);
        }
        $decoded = json_decode($payloadJson);
        if (json_last_error() !== JSON_ERROR_NONE) {
            patzer_json(400, ['ok' => false, 'error' => 'Restore item payloadJson is not valid JSON.']);
        }
        if ($decoded === null) {
            // Mirror the legacy live-payload rule: patzer_item_payload rejects a null payload on a
            // non-tombstone row, so the exact-transport path rejects a literal "null" payloadJson.
            patzer_json(400, ['ok' => false, 'error' => 'Restore item payloadJson must not be null for a live item.']);
        }
        // Encodability gate — mirrors the SECOND legacy rule in patzer_item_payload (json_encode
        // failure rejects the item). PHP decodes lexemes like 1e400 to INF with JSON_ERROR_NONE,
        // and INF cannot be json_encode()d; if such bytes were staged, pull.php and export.php
        // (which decode staged rows and re-encode them into their JSON responses) would fail
        // AFTER commit, poisoning those responses (e.g. an empty HTTP-200 body). Validation only:
        // the encode result is DISCARDED — the original bytes are still returned/staged/hashed.
        if (!is_string(json_encode($decoded, JSON_UNESCAPED_SLASHES))) {
            patzer_json(400, ['ok' => false, 'error' => 'Restore item payloadJson could not be re-encoded for sync reads.']);
        }
        return $payloadJson;
    }
    return patzer_item_payload($item);
}

function patzer_book_token_secret(array $config): string {
    $secret = $config['book_token_secret'] ?? '';
    if (is_string($secret) && strlen($secret) >= 32) {
        return $secret;
    }

    $syncTokenHash = $config['sync_token_hash'] ?? '';
    if (is_string($syncTokenHash) && preg_match('/\A[a-f0-9]{64}\z/i', $syncTokenHash) === 1) {
        return $syncTokenHash;
    }

    patzer_json(500, [
        'ok' => false,
        'error' => 'Patzer sync config needs book_token_secret or a valid sync_token_hash for Lichess book token storage.',
    ]);
}

function patzer_book_token_key(string $secret): string {
    return hash('sha256', $secret, true);
}

function patzer_encrypt_book_token(string $token, string $secret): array {
    if (!function_exists('openssl_encrypt')) {
        patzer_json(500, ['ok' => false, 'error' => 'OpenSSL is required for Lichess book token storage.']);
    }
    try {
        $iv = random_bytes(12);
    } catch (Throwable $error) {
        patzer_json(500, ['ok' => false, 'error' => 'Could not create secure token nonce.']);
    }
    $tag = '';
    $ciphertext = openssl_encrypt($token, 'aes-256-gcm', patzer_book_token_key($secret), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ciphertext === false || $tag === '') {
        patzer_json(500, ['ok' => false, 'error' => 'Could not encrypt Lichess book token.']);
    }
    return [
        'ciphertext' => base64_encode($ciphertext),
        'iv' => base64_encode($iv),
        'tag' => base64_encode($tag),
    ];
}

function patzer_decrypt_book_token(array $row, string $secret): string {
    if (!function_exists('openssl_decrypt')) {
        patzer_json(500, ['ok' => false, 'error' => 'OpenSSL is required for Lichess book token storage.']);
    }
    $ciphertext = base64_decode((string) ($row['token_ciphertext'] ?? ''), true);
    $iv = base64_decode((string) ($row['token_iv'] ?? ''), true);
    $tag = base64_decode((string) ($row['token_tag'] ?? ''), true);
    if ($ciphertext === false || $iv === false || $tag === false) {
        patzer_json(500, ['ok' => false, 'error' => 'Stored Lichess book token is malformed.']);
    }
    $token = openssl_decrypt($ciphertext, 'aes-256-gcm', patzer_book_token_key($secret), OPENSSL_RAW_DATA, $iv, $tag);
    if (!is_string($token) || $token === '') {
        patzer_json(500, ['ok' => false, 'error' => 'Stored Lichess book token could not be decrypted.']);
    }
    return $token;
}

function patzer_book_auth_row(PDO $pdo, string $userKey): ?array {
    $stmt = $pdo->prepare(
        'SELECT lichess_username, token_ciphertext, token_iv, token_tag, token_expires_at_ms, updated_at_ms
         FROM patzer_book_auth
         WHERE user_key = ?
         LIMIT 1'
    );
    $stmt->execute([$userKey]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function patzer_book_auth_expired(?array $row): bool {
    if (!$row) return false;
    if ($row['token_expires_at_ms'] === null) return false;
    $expiresAt = (int) $row['token_expires_at_ms'];
    return $expiresAt > 0 && $expiresAt <= patzer_now_ms();
}
