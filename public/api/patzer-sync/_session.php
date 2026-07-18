<?php
declare(strict_types=1);

const PATZER_AUTH_LIFECYCLE_VERSION = 'patzer-auth-lifecycle-v1';

function patzer_session_config_string(array $config, string $key): string {
    $value = $config[$key] ?? null;
    if (!is_string($value) || $value === '') patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    return $value;
}

function patzer_session_config_int(array $config, string $key, int $minimum, int $maximum): int {
    $value = filter_var($config[$key] ?? null, FILTER_VALIDATE_INT);
    if ($value === false || $value < $minimum || $value > $maximum) patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    return $value;
}

function patzer_session_config_is_valid(array $config): bool {
    if (($config['auth_lifecycle_config_version'] ?? null) !== PATZER_AUTH_LIFECYCLE_VERSION ||
        ($config['auth_canonical_origin'] ?? null) !== 'https://chesspatzer.com') {
        return false;
    }
    $cookieName = $config['auth_session_cookie_name'] ?? null;
    if (!is_string($cookieName)) return false;
    if (substr($cookieName, 0, 7) !== '__Host-' || preg_match('/^__Host-[A-Za-z0-9_-]{1,55}$/', $cookieName) !== 1) {
        return false;
    }
    $secretKeys = ['auth_invite_pepper','auth_session_pepper','auth_csrf_key','auth_source_fingerprint_key'];
    $secrets = [];
    foreach ($secretKeys as $key) {
        $value = $config[$key] ?? null;
        if (!is_string($value) || strlen($value) < 32) return false;
        $secrets[] = $value;
    }
    if (count(array_unique($secrets, SORT_STRING)) !== count($secrets)) return false;
    $idKeys = ['auth_invite_key_id','auth_session_key_id','auth_csrf_key_id','auth_source_fingerprint_key_id'];
    $ids = [];
    foreach ($idKeys as $key) {
        $value = $config[$key] ?? null;
        if (!is_string($value) || preg_match('/^[A-Za-z0-9._-]{3,64}$/', $value) !== 1) return false;
        $ids[] = $value;
    }
    if (count(array_unique($ids, SORT_STRING)) !== count($ids)) return false;
    $validInt = static function(array $source, string $key, int $minimum, int $maximum): ?int {
        $value = filter_var($source[$key] ?? null, FILTER_VALIDATE_INT);
        return $value === false || $value < $minimum || $value > $maximum ? null : $value;
    };
    if ($validInt($config, 'auth_session_ttl_seconds', 60, 2592000) === null ||
        $validInt($config, 'auth_max_active_sessions_per_principal', 1, 20) === null ||
        $validInt($config, 'auth_activation_body_max_bytes', 64, 16384) === null ||
        $validInt($config, 'auth_activation_rate_window_seconds', 1, 86400) === null) return false;
    $sourceLimit = $validInt($config, 'auth_activation_rate_source_limit', 1, 1000);
    if ($sourceLimit === null || $validInt($config, 'auth_activation_rate_global_limit', $sourceLimit, 100000) === null) return false;
    $allowlists = $config['auth_activation_allowlists'] ?? null;
    $states = ['R4-disposable-auth-probe','R5-fail-closed-v2','R6-isolated-test','R7-gate-a-ready','R8-controlled-beta'];
    if (!is_array($allowlists) || array_keys($allowlists) !== $states) return false;
    foreach ($states as $state) {
        $bindings = $allowlists[$state];
        if (!is_array($bindings) || !array_is_list($bindings) || count(array_unique($bindings, SORT_STRING)) !== count($bindings)) return false;
        if (($state === 'R5-fail-closed-v2' || $state === 'R7-gate-a-ready') && $bindings !== []) return false;
        if ($state === 'R4-disposable-auth-probe' && count($bindings) !== 1) return false;
        foreach ($bindings as $binding) {
            if (!is_string($binding) || preg_match('/^prn_[A-Za-z0-9_-]{8,60}:inv_[A-Za-z0-9_-]{8,60}$/', $binding) !== 1) return false;
        }
    }
    $expiryBounds = $config['auth_rollout_session_expires_at'] ?? null;
    if (!is_array($expiryBounds) || array_is_list($expiryBounds) && $expiryBounds !== []) return false;
    foreach ($expiryBounds as $state => $bound) {
        if (!in_array($state, ['R4-disposable-auth-probe','R6-isolated-test','R8-controlled-beta'], true) || !is_string($bound)) return false;
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\+00:00)$/D', $bound) !== 1) return false;
        $normalizedBound = substr($bound, -1) === 'Z' ? substr($bound, 0, -1) . '+00:00' : $bound;
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $normalizedBound, new DateTimeZone('UTC'));
        $parseErrors = DateTimeImmutable::getLastErrors();
        if ($parsed === false ||
            is_array($parseErrors) && ((int)$parseErrors['warning_count'] !== 0 || (int)$parseErrors['error_count'] !== 0) ||
            $parsed->format(DateTimeInterface::ATOM) !== $normalizedBound) return false;
    }
    return true;
}

function patzer_session_validate_config(array $config): array {
    if (!patzer_session_config_is_valid($config)) patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    return $config;
}

function patzer_session_require_https(): void {
    $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    if (!in_array($https, ['on','1'], true)) patzer_json(400, ['ok'=>false,'error'=>'https-required']);
}

function patzer_session_origin_is_exact(array $config): bool {
    $expected = patzer_session_config_string($config, 'auth_canonical_origin');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    return is_string($origin) && strpos($origin, ',') === false && hash_equals($expected, $origin);
}

function patzer_session_require_exact_origin(array $config): void {
    if (!patzer_session_origin_is_exact($config)) patzer_json(403, ['ok'=>false,'error'=>'origin-denied']);
}

function patzer_session_request_config(bool $allowTerminal = false): array {
    $config = patzer_session_validate_config(patzer_config());
    $pdo = patzer_db_request($config);
    $rollout = patzer_auth_rollout($pdo, $config);
    $config['request_pdo'] = $pdo;
    $config['auth_rollout'] = $rollout;
    $endpoint = basename((string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($endpoint === 'session-status.php' || $endpoint === 'session-logout.php') {
        $context = patzer_authenticate_session($pdo, $config, $rollout, $allowTerminal, true);
        if ($context === null) patzer_auth_denied();
        $config['auth_context'] = $context;
        $config['auth_identity'] = $context['principalId'];
        $config['user_key'] = $context['userKey'];
    }
    return $config;
}

function patzer_session_b64url(string $bytes): string {
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function patzer_session_opaque(string $prefix, int $bytes = 32): string {
    return $prefix . patzer_session_b64url(random_bytes($bytes));
}

function patzer_session_cookie_name(array $config): string {
    $name = patzer_session_config_string($config, 'auth_session_cookie_name');
    if (substr($name, 0, 7) !== '__Host-' || preg_match('/^__Host-[A-Za-z0-9_-]{1,55}$/', $name) !== 1) {
        patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    }
    return $name;
}

function patzer_session_source_fingerprint(array $config): string {
    return patzer_session_source_fingerprint_details($config)['fingerprint'];
}

function patzer_session_source_fingerprint_details(array $config): array {
    $key = patzer_session_config_string($config, 'auth_source_fingerprint_key');
    $keyId = patzer_session_config_string($config, 'auth_source_fingerprint_key_id');
    $address = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $keyTag = substr(hash('sha256', "source-fingerprint-key-id\0" . $keyId), 0, 12);
    $digest = hash_hmac('sha256', "source-fingerprint\0" . PATZER_AUTH_LIFECYCLE_VERSION . "\0" . $keyId . "\0" . $address, $key);
    return [
        'fingerprint'=>'src-v1.' . $keyTag . '.' . $digest,
        'sourceFingerprintVersion'=>'src-v1',
        'sourceKeyTag'=>'sha256:' . $keyTag,
    ];
}

function patzer_session_record_activation_attempt(PDO $pdo, array $config, array $rollout): void {
    $window = patzer_session_config_int($config, 'auth_activation_rate_window_seconds', 1, 86400);
    $sourceLimit = patzer_session_config_int($config, 'auth_activation_rate_source_limit', 1, 1000);
    $globalLimit = patzer_session_config_int($config, 'auth_activation_rate_global_limit', $sourceLimit, 100000);
    $fingerprintDetails = patzer_session_source_fingerprint_details($config);
    $fingerprint = $fingerprintDetails['fingerprint'];
    try {
        $pdo->beginTransaction();
        $row = $pdo->query("SELECT state,state_version FROM patzer_auth_rollout_state WHERE rollout_id='primary' FOR UPDATE")->fetch();
        if (!is_array($row) || $row['state'] !== $rollout['state'] || (int)$row['state_version'] !== (int)$rollout['stateVersion']) throw new RuntimeException('rollout-drift');
        $source = $pdo->prepare("SELECT COUNT(*) FROM patzer_auth_audit_events WHERE action='session-activation-attempt' AND occurred_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? SECOND) AND non_secret_fingerprint=?");
        $source->execute([$window, $fingerprint]);
        $global = $pdo->prepare("SELECT COUNT(*) FROM patzer_auth_audit_events WHERE action='session-activation-attempt' AND occurred_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? SECOND)");
        $global->execute([$window]);
        if ((int)$source->fetchColumn() >= $sourceLimit || (int)$global->fetchColumn() >= $globalLimit) {
            $pdo->rollBack();
            header('Retry-After: ' . $window);
            patzer_json(429, ['ok'=>false,'error'=>'activation-rate-limited']);
        }
        patzer_session_insert_audit($pdo, ['action'=>'session-activation-attempt','outcome'=>'stopped','fingerprint'=>$fingerprint,'metadata'=>[
            'windowSeconds'=>$window,
            'sourceFingerprintVersion'=>$fingerprintDetails['sourceFingerprintVersion'],
            'sourceKeyTag'=>$fingerprintDetails['sourceKeyTag'],
        ]]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    }
}

function patzer_session_activation_allowed(array $config, string $state, string $principalId, string $inviteId): bool {
    $all = $config['auth_activation_allowlists'] ?? null;
    if (!is_array($all)) return false;
    $allowed = $all[$state] ?? null;
    if (!is_array($allowed) || !array_is_list($allowed)) return false;
    $needle = $principalId . ':' . $inviteId;
    return in_array($needle, $allowed, true);
}

function patzer_session_rollout_principal_allowed(array $config, string $state, string $principalId): bool {
    $allowed = $config['auth_activation_allowlists'][$state] ?? null;
    if (!is_array($allowed) || !array_is_list($allowed)) return false;
    foreach ($allowed as $binding) {
        if (is_string($binding) && strpos($binding, $principalId . ':') === 0) return true;
    }
    return false;
}

function patzer_session_insert_audit(PDO $pdo, array $row): string {
    $eventId = $row['eventId'] ?? patzer_session_opaque('evt_', 24);
    $metadata = json_encode($row['metadata'] ?? [], JSON_UNESCAPED_SLASHES);
    if (!is_string($metadata)) throw new RuntimeException('audit-json');
    $stmt = $pdo->prepare('INSERT INTO patzer_auth_audit_events (event_id,action,outcome,principal_id,auth_context_id,session_id,rollout_id,non_secret_fingerprint,authority_reference,prior_state,new_state,safe_metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $eventId, $row['action'], $row['outcome'], $row['principalId'] ?? null,
        $row['authContextId'] ?? null, $row['sessionId'] ?? null, 'primary',
        $row['fingerprint'] ?? null, 'patzer-auth-lifecycle-v1',
        $row['priorState'] ?? null, $row['newState'] ?? null, $metadata,
    ]);
    if ($stmt->rowCount() !== 1) throw new RuntimeException('audit-write');
    return $eventId;
}

function patzer_session_read_activation_body(array $config): string {
    if (($_SERVER['QUERY_STRING'] ?? '') !== '' || isset($_SERVER['HTTP_AUTHORIZATION']) || isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        patzer_json(400, ['ok'=>false,'error'=>'invalid-activation-request']);
    }
    $contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') patzer_json(415, ['ok'=>false,'error'=>'json-required']);
    $maximum = patzer_session_config_int($config, 'auth_activation_body_max_bytes', 64, 16384);
    $declared = filter_var($_SERVER['CONTENT_LENGTH'] ?? null, FILTER_VALIDATE_INT);
    if ($declared !== false && $declared > $maximum) patzer_json(413, ['ok'=>false,'error'=>'activation-body-too-large']);
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > $maximum) patzer_json(413, ['ok'=>false,'error'=>'activation-body-too-large']);
    $inviteKeyCount = preg_match_all('/"invite"\s*:/', $raw);
    $body = json_decode($raw, true);
    if ($inviteKeyCount !== 1 || !is_array($body) || array_is_list($body) || array_keys($body) !== ['invite'] ||
        !is_string($body['invite']) || preg_match('/^[A-Za-z0-9_-]{32,512}$/D', $body['invite']) !== 1) {
        patzer_json(400, ['ok'=>false,'error'=>'invalid-activation-request']);
    }
    return $body['invite'];
}

function patzer_session_csrf_token_for_secret(array $context, array $config, string $secret): string {
    $key = patzer_session_config_string($config, 'auth_csrf_key');
    $keyId = patzer_session_config_string($config, 'auth_csrf_key_id');
    if ($secret === '') patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    $sessionHash = hash_hmac('sha256', $secret, patzer_session_config_string($config, 'auth_session_pepper'));
    $message = implode("\0", [
        'csrf-v1', $keyId, $secret, $sessionHash, (string)$context['sessionId'],
        (string)$context['authContextId'], (string)$context['principalId'],
        (string)$context['capabilityVersion'], (string)$context['sessionExpiresAt'],
    ]);
    return 'csrf-v1.' . $keyId . '.' . patzer_session_b64url(hash_hmac('sha256', $message, $key, true));
}

function patzer_session_csrf_token(array $context): string {
    $token = $context['_csrfToken'] ?? null;
    if (!is_string($token) || $token === '') patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    return $token;
}

function patzer_verify_cookie_mutation(array $context, array $config): bool {
    patzer_session_require_https();
    if (!patzer_session_origin_is_exact($config)) return false;
    $actual = $_SERVER['HTTP_X_PATZER_CSRF'] ?? null;
    if (!is_string($actual)) return false;
    return hash_equals(patzer_session_csrf_token($context), $actual);
}

function patzer_session_public_context(array $context, array $config): array {
    return [
        'principalId' => $context['principalId'],
        'userKey' => $context['userKey'],
        'tier' => $context['tier'],
        'capabilities' => $context['capabilities'],
        'capabilityVersion' => $context['capabilityVersion'],
        'authContextId' => $context['authContextId'],
        'sessionExpiresAt' => $context['sessionExpiresAt'],
        'csrf' => patzer_session_csrf_token($context),
    ];
}

function patzer_session_scrub_verified_post(array $config): array {
    unset($config['auth_invite_pepper'], $config['auth_session_pepper'], $config['auth_csrf_key'], $config['auth_source_fingerprint_key']);
    if (isset($config['auth_context']) && is_array($config['auth_context'])) {
        unset($config['auth_context']['_csrfToken']);
    }
    return $config;
}

function patzer_session_set_cookie(array $config, string $secret, DateTimeImmutable $expiresAt): bool {
    $maxAge = max(0, $expiresAt->getTimestamp() - time());
    if ($maxAge <= 0) return false;
    return setcookie(patzer_session_cookie_name($config), $secret, [
        'expires'=>$expiresAt->getTimestamp(), 'path'=>'/', 'secure'=>true,
        'httponly'=>true, 'samesite'=>'Strict',
    ]);
}

function patzer_session_clear_cookie(array $config): bool {
    return setcookie(patzer_session_cookie_name($config), '', [
        'expires'=>1, 'path'=>'/', 'secure'=>true, 'httponly'=>true, 'samesite'=>'Strict',
    ]);
}

// Lifecycle writer lock order: rollout -> invite/session -> principal.
function patzer_session_activate(array $config): never {
    patzer_session_require_exact_origin($config);
    $pdo = $config['request_pdo'];
    $rollout = $config['auth_rollout'];
    if ($rollout['state'] === 'RB-beta-maintenance') {
        header('Retry-After: 300');
        patzer_json(503, ['ok'=>false,'error'=>'auth-rollout-maintenance']);
    }
    if (!in_array($rollout['state'], ['R4-disposable-auth-probe','R6-isolated-test','R8-controlled-beta'], true)) patzer_auth_denied();
    $cookieName = patzer_session_cookie_name($config);
    if (strpos((string)($_SERVER['HTTP_COOKIE'] ?? ''), $cookieName . '=') !== false) {
        $existing = patzer_authenticate_session($pdo, $config, $rollout, false, true, true);
        if ($existing !== null) patzer_json(409, ['ok'=>false,'error'=>'already-authenticated']);
    }
    $inviteSecret = patzer_session_read_activation_body($config);
    patzer_session_record_activation_attempt($pdo, $config, $rollout);
    $invitePepper = patzer_session_config_string($config, 'auth_invite_pepper');
    $inviteKeyId = patzer_session_config_string($config, 'auth_invite_key_id');
    $inviteHash = hash_hmac('sha256', $inviteSecret, $invitePepper);
    $sourceFingerprintDetails = patzer_session_source_fingerprint_details($config);
    $sourceFingerprint = $sourceFingerprintDetails['fingerprint'];
    $sessionSecret = patzer_session_b64url(random_bytes(32));
    $sessionId = patzer_session_opaque('ses_');
    $contextId = patzer_session_opaque('ctx_');
    $rotationId = patzer_session_opaque('rot_', 24);
    $deviceId = patzer_session_opaque('dev_', 24);
    $sessionHash = hash_hmac('sha256', $sessionSecret, patzer_session_config_string($config, 'auth_session_pepper'));
    $sessionFingerprint = 'sha256:' . hash('sha256', $sessionSecret);
    $auditId = patzer_session_opaque('evt_', 24);
    try {
        $pdo->beginTransaction();
        $rolloutRows = $pdo->query("SELECT state,state_version,compatible_auth_version,compatible_config_version FROM patzer_auth_rollout_state WHERE rollout_id='primary' FOR UPDATE")->fetchAll();
        if (count($rolloutRows) !== 1 || $rolloutRows[0]['state'] !== $rollout['state'] || (int)$rolloutRows[0]['state_version'] !== (int)$rollout['stateVersion']) throw new DomainException('denied');
        $inviteStmt = $pdo->prepare('SELECT invite_id,principal_id,hash_algorithm,hash_key_id,invite_fingerprint,state,not_before,expires_at,consumed_at,revoked_at,capability_version FROM patzer_auth_invites WHERE invite_hash=? LIMIT 2 FOR UPDATE');
        $inviteStmt->execute([$inviteHash]);
        $inviteRows = $inviteStmt->fetchAll();
        if (count($inviteRows) !== 1) throw new DomainException('denied');
        $invite = $inviteRows[0];
        $principalStmt = $pdo->prepare('SELECT principal_id,capability_version,expires_at,status,revoked_at FROM patzer_auth_principals WHERE principal_id=? LIMIT 2 FOR UPDATE');
        $principalStmt->execute([$invite['principal_id']]);
        $principalRows = $principalStmt->fetchAll();
        if (count($principalRows) !== 1) throw new DomainException('denied');
        $principalRow = $principalRows[0];
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $inviteNotBefore = patzer_auth_database_time($invite['not_before']);
        $inviteExpires = patzer_auth_database_time($invite['expires_at']);
        if (!patzer_session_activation_allowed($config, $rollout['state'], (string)$invite['principal_id'], (string)$invite['invite_id']) ||
            $invite['state'] !== 'issued' || $invite['consumed_at'] !== null || $invite['revoked_at'] !== null || $inviteNotBefore > $now || $inviteExpires <= $now ||
            $invite['hash_algorithm'] !== 'hmac-sha256-v1' || !hash_equals($inviteKeyId, (string)$invite['hash_key_id']) ||
            !hash_equals('sha256:' . hash('sha256', $inviteSecret), (string)$invite['invite_fingerprint']) ||
            (int)$invite['capability_version'] !== (int)$principalRow['capability_version'] || $principalRow['status'] !== 'active' || $principalRow['revoked_at'] !== null) throw new DomainException('denied');
        $context = patzer_auth_load_principal($pdo, (string)$invite['principal_id'], $rollout, 'session-v1', [
            'session_id'=>$sessionId, 'session_fingerprint'=>$sessionFingerprint, 'auth_context_id'=>$contextId,
            'capability_version'=>$invite['capability_version'], 'issued_at'=>$now->format('Y-m-d H:i:s.u'),
            'expires_at'=>$inviteExpires->format('Y-m-d H:i:s.u'), 'revoked_at'=>null, 'logout_at'=>null,
        ]);
        $active = $pdo->prepare("SELECT COUNT(*) FROM patzer_auth_sessions WHERE principal_id=? AND status='active' AND expires_at>UTC_TIMESTAMP(6)");
        $active->execute([$invite['principal_id']]);
        $maxSessions = $rollout['state'] === 'R4-disposable-auth-probe' ? 1 : patzer_session_config_int($config, 'auth_max_active_sessions_per_principal', 1, 20);
        if ((int)$active->fetchColumn() >= $maxSessions) throw new DomainException('denied');
        $ttlExpiry = $now->modify('+' . patzer_session_config_int($config, 'auth_session_ttl_seconds', 60, 2592000) . ' seconds');
        $principalExpiry = $principalRow['expires_at'] === null ? $ttlExpiry : patzer_auth_database_time($principalRow['expires_at']);
        $expiresAt = min($ttlExpiry, $inviteExpires, $principalExpiry);
        $bounds = $config['auth_rollout_session_expires_at'][$rollout['state']] ?? null;
        if (is_string($bounds) && $bounds !== '') $expiresAt = min($expiresAt, new DateTimeImmutable($bounds, new DateTimeZone('UTC')));
        if ($expiresAt <= $now) throw new DomainException('denied');
        $context['sessionExpiresAt'] = $expiresAt->format('Y-m-d H:i:s.u');
        $context['_csrfToken'] = patzer_session_csrf_token_for_secret($context, $config, $sessionSecret);
        $publicContext = patzer_session_public_context($context, $config);
        $consume = $pdo->prepare("UPDATE patzer_auth_invites SET state='consumed',consumed_at=UTC_TIMESTAMP(6) WHERE invite_id=? AND state='issued' AND consumed_at IS NULL AND revoked_at IS NULL");
        $consume->execute([$invite['invite_id']]);
        if ($consume->rowCount() !== 1) throw new RuntimeException('consume');
        patzer_session_insert_audit($pdo, ['eventId'=>$auditId,'action'=>'session-activated','outcome'=>'success','principalId'=>$invite['principal_id'],'authContextId'=>$contextId,'sessionId'=>$sessionId,'fingerprint'=>$sourceFingerprint,'priorState'=>'invite-issued','newState'=>'session-active','metadata'=>[
            'inviteId'=>$invite['invite_id'],
            'capabilityVersion'=>(int)$invite['capability_version'],
            'sourceFingerprintVersion'=>$sourceFingerprintDetails['sourceFingerprintVersion'],
            'sourceKeyTag'=>$sourceFingerprintDetails['sourceKeyTag'],
        ]]);
        $insert = $pdo->prepare('INSERT INTO patzer_auth_sessions (session_id,principal_id,session_hash,hash_algorithm,hash_key_id,session_fingerprint,auth_context_id,capability_version,issued_at,expires_at,rotation_family_id,device_id,status,issue_audit_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $insert->execute([$sessionId,$invite['principal_id'],$sessionHash,'hmac-sha256-v1',patzer_session_config_string($config,'auth_session_key_id'),$sessionFingerprint,$contextId,$invite['capability_version'],$now->format('Y-m-d H:i:s.u'),$expiresAt->format('Y-m-d H:i:s.u'),$rotationId,$deviceId,'active',$auditId]);
        if ($insert->rowCount() !== 1) throw new RuntimeException('session');
        $pdo->commit();
    } catch (DomainException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_auth_denied();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    }
    if (!patzer_session_set_cookie($config, $sessionSecret, $expiresAt)) {
        try {
            $pdo->beginTransaction();
            $revoke = $pdo->prepare("UPDATE patzer_auth_sessions SET status='revoked',revoked_at=UTC_TIMESTAMP(6) WHERE session_id=? AND status='active'");
            $revoke->execute([$sessionId]);
            patzer_session_insert_audit($pdo, ['action'=>'session-cookie-failed','outcome'=>'failure','principalId'=>$context['principalId'],'authContextId'=>$contextId,'sessionId'=>$sessionId,'priorState'=>'active','newState'=>'revoked','metadata'=>[]]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            try {
                $pdo->beginTransaction();
                $fallback = $pdo->prepare("UPDATE patzer_auth_sessions SET status='revoked',revoked_at=UTC_TIMESTAMP(6) WHERE session_id=? AND status='active'");
                $fallback->execute([$sessionId]);
                if ($fallback->rowCount() !== 1) throw new RuntimeException('cookie-compensation-fallback');
                $pdo->commit();
            } catch (Throwable $fallbackError) {
                if ($pdo->inTransaction()) $pdo->rollBack();
            }
        }
        patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    }
    patzer_json(201, ['ok'=>true,'session'=>$publicContext]);
}

function patzer_session_status(array $config): never {
    patzer_json(200, ['ok'=>true,'session'=>$config['auth_public_context']]);
}

function patzer_session_logout(array $config): never {
    $pdo = $config['request_pdo'];
    $context = $config['auth_context'];
    if (($context['_sessionStatus'] ?? null) !== 'active') {
        if (!patzer_session_clear_cookie($config)) patzer_json(503, ['ok'=>false,'error'=>'logout-cookie-clear-failed','serverRevoked'=>true]);
        patzer_json(200, ['ok'=>true,'serverRevoked'=>true,'replayed'=>true]);
    }
    try {
        $pdo->beginTransaction();
        $rollout = $pdo->query("SELECT state,state_version FROM patzer_auth_rollout_state WHERE rollout_id='primary' FOR UPDATE")->fetch();
        if (!is_array($rollout) || $rollout['state'] !== $context['rolloutState'] || (int)$rollout['state_version'] !== (int)$context['rolloutVersion']) throw new RuntimeException('rollout-binding');
        $sessionStmt = $pdo->prepare('SELECT session_id,principal_id,status,capability_version FROM patzer_auth_sessions WHERE session_id=? FOR UPDATE');
        $sessionStmt->execute([$context['sessionId']]);
        $session = $sessionStmt->fetch();
        if (!is_array($session) || $session['status'] !== 'active' || !hash_equals((string)$context['principalId'], (string)$session['principal_id'])) throw new RuntimeException('session-state');
        $principal = $pdo->prepare('SELECT principal_id,capability_version,status FROM patzer_auth_principals WHERE principal_id=? FOR UPDATE');
        $principal->execute([$context['principalId']]);
        $principalRow = $principal->fetch();
        if (!is_array($principalRow) || $principalRow['status'] !== 'active' || (int)$principalRow['capability_version'] !== (int)$context['capabilityVersion']) throw new RuntimeException('binding');
        $update = $pdo->prepare("UPDATE patzer_auth_sessions SET status='logged-out',logout_at=UTC_TIMESTAMP(6) WHERE session_id=? AND status='active'");
        $update->execute([$context['sessionId']]);
        if ($update->rowCount() !== 1) throw new RuntimeException('logout');
        patzer_session_insert_audit($pdo, ['action'=>'session-logout','outcome'=>'success','principalId'=>$context['principalId'],'authContextId'=>$context['authContextId'],'sessionId'=>$context['sessionId'],'fingerprint'=>$context['fingerprint'],'priorState'=>'active','newState'=>'logged-out','metadata'=>['capabilityVersion'=>(int)$context['capabilityVersion']]]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        patzer_json(503, ['ok'=>false,'error'=>'auth-lifecycle-unavailable']);
    }
    if (!patzer_session_clear_cookie($config)) patzer_json(503, ['ok'=>false,'error'=>'logout-cookie-clear-failed','serverRevoked'=>true]);
    patzer_json(200, ['ok'=>true,'serverRevoked'=>true,'replayed'=>false]);
}
