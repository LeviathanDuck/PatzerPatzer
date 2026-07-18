<?php
declare(strict_types=1);

const PATZER_ACCESS_CONTRACT_VERSION = 'patzer-access-v1';
const PATZER_AUTH_ROLLOUT_CONTRACT_VERSION = 'patzer-auth-rollout-v1';
const PATZER_AUTH_SCHEMA_MANIFEST_HASH = 'sha256:f6a0638b723589e222e830b2c9ee96df3b0aba49f87a99bc3038f88a9719a729';

function patzer_auth_denied(): never {
    patzer_json(401, ['ok' => false, 'error' => 'authentication-required']);
}

function patzer_auth_database_time(mixed $value): DateTimeImmutable {
    if (!is_string($value) || $value === '') patzer_auth_denied();
    $parsed = DateTimeImmutable::createFromFormat('Y-m-d H:i:s.u', $value, new DateTimeZone('UTC'));
    if (!$parsed || $parsed->format('Y-m-d H:i:s.u') !== $value) patzer_auth_denied();
    return $parsed;
}

function patzer_auth_rollout(PDO $pdo, array $config): array {
    try {
        $tableRows = $pdo->query("SELECT TABLE_NAME,TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'patzer_auth_%' ORDER BY TABLE_NAME")->fetchAll();
        if ($tableRows === []) return ['state' => 'R0-current-legacy', 'stateVersion' => 0, 'schemaReady' => false];
        $requiredTables = ['patzer_auth_audit_events','patzer_auth_capability_catalog','patzer_auth_invites','patzer_auth_legacy_bindings','patzer_auth_operator_confirmations','patzer_auth_preset_capabilities','patzer_auth_presets','patzer_auth_principal_capabilities','patzer_auth_principals','patzer_auth_rollout_state','patzer_auth_schema_state','patzer_auth_sessions'];
        $actualTables = [];
        foreach ($tableRows as $tableRow) {
            if (($tableRow['TABLE_TYPE'] ?? null) !== 'BASE TABLE' || !is_string($tableRow['TABLE_NAME'] ?? null)) patzer_auth_denied();
            $actualTables[] = $tableRow['TABLE_NAME'];
        }
        sort($requiredTables, SORT_STRING);
        sort($actualTables, SORT_STRING);
        if ($actualTables !== $requiredTables) patzer_auth_denied();
        $schema = $pdo->prepare('SELECT contract_version,schema_version,migration_id,manifest_hash FROM patzer_auth_schema_state WHERE contract_version = ? LIMIT 2');
        $schema->execute([PATZER_AUTH_ROLLOUT_CONTRACT_VERSION]);
        $schemaRows = $schema->fetchAll();
        $rollout = $pdo->query("SELECT state, state_version, compatible_auth_version, compatible_config_version FROM patzer_auth_rollout_state WHERE rollout_id = 'primary' LIMIT 2")->fetchAll();
    } catch (Throwable $error) {
        patzer_auth_denied();
    }
    if (count($schemaRows) !== 1 || count($rollout) !== 1) patzer_auth_denied();
    $schemaRow = $schemaRows[0];
    if (($schemaRow['contract_version'] ?? null) !== PATZER_AUTH_ROLLOUT_CONTRACT_VERSION ||
        (int)($schemaRow['schema_version'] ?? 0) !== 1 || ($schemaRow['migration_id'] ?? null) !== 'patzer-auth-schema-v1' ||
        ($schemaRow['manifest_hash'] ?? null) !== PATZER_AUTH_SCHEMA_MANIFEST_HASH) patzer_auth_denied();
    $row = $rollout[0];
    $state = $row['state'] ?? null;
    $stateVersion = filter_var($row['state_version'] ?? null, FILTER_VALIDATE_INT);
    if (!is_string($state) || $stateVersion === false || $stateVersion < 1 ||
        ($row['compatible_auth_version'] ?? null) !== PATZER_ACCESS_CONTRACT_VERSION) {
        patzer_auth_denied();
    }
    if (!in_array($state, ['R1-schema-ready','R2-legacy-bootstrapped'], true)) {
        $configVersion = $config['auth_config_version'] ?? null;
        if (!is_string($configVersion) || !hash_equals((string)$row['compatible_config_version'], $configVersion)) patzer_auth_denied();
    }
    return ['state' => $state, 'stateVersion' => $stateVersion, 'schemaReady' => true];
}

function patzer_auth_legacy_compat_capabilities(string $identity): array {
    $common = ['sync.status-own','sync.read-own','sync.write-own','sync.export-own','sync.invalidate-own'];
    if ($identity === 'legacy') return array_merge($common, [
        'sync.recovery-destructive-own','book.read-own','book.manage-own',
    ]);
    return [];
}

function patzer_auth_known_capabilities(): array {
    return ['sync.status-own','sync.read-own','sync.write-own','sync.export-own','sync.invalidate-own','sync.recovery-destructive-own','book.read-own','book.manage-own','diagnostics.submit-report','diagnostics.submit-package','diagnostics.submit-screenshot','diagnostics.read-own-status','diagnostics.read-own-upload-status'];
}

function patzer_auth_validate_scope(string $capability, string $scopeJson, string $userKey): array {
    $scope = json_decode($scopeJson, true);
    if (!is_array($scope) || array_is_list($scope)) patzer_auth_denied();
    if ($scope !== ['kind' => 'self']) patzer_auth_denied();
    return $scope;
}

function patzer_auth_load_principal(PDO $pdo, string $principalId, array $rollout, string $authType, ?array $session = null): array {
    $catalog = $pdo->query('SELECT capability_name,catalog_version,enabled FROM patzer_auth_capability_catalog ORDER BY capability_name')->fetchAll();
    $catalogNames = [];
    foreach ($catalog as $entry) {
        if (($entry['catalog_version'] ?? null) !== PATZER_ACCESS_CONTRACT_VERSION || (int)($entry['enabled'] ?? 0) !== 1 || !is_string($entry['capability_name'] ?? null)) patzer_auth_denied();
        $catalogNames[] = $entry['capability_name'];
    }
    $known = patzer_auth_known_capabilities();
    sort($known);
    if ($catalogNames !== $known) patzer_auth_denied();
    $stmt = $pdo->prepare('SELECT principal_id,user_key,tier,status,capability_version,issued_at,not_before,expires_at,revoked_at FROM patzer_auth_principals WHERE principal_id = ? LIMIT 2');
    $stmt->execute([$principalId]);
    $rows = $stmt->fetchAll();
    if (count($rows) !== 1) patzer_auth_denied();
    $principal = $rows[0];
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $issuedAt = patzer_auth_database_time($principal['issued_at'] ?? null);
    $notBefore = $principal['not_before'] === null ? null : patzer_auth_database_time($principal['not_before']);
    $expiresAt = $principal['expires_at'] === null ? null : patzer_auth_database_time($principal['expires_at']);
    if (!is_string($principal['principal_id'] ?? null) || $principal['principal_id'] === '' ||
        !is_string($principal['user_key'] ?? null) || trim($principal['user_key']) === '' ||
        !in_array($principal['tier'] ?? null, ['admin','agent','beta','public-day'], true) ||
        (in_array($principal['tier'] ?? null, ['beta','public-day'], true) && $expiresAt === null) ||
        strlen((string)$principal['user_key']) > 128 || ($principal['status'] ?? null) !== 'active' || $principal['revoked_at'] !== null || $issuedAt > $now ||
        ($notBefore !== null && $notBefore > $now) || ($expiresAt !== null && $expiresAt <= $now)) patzer_auth_denied();
    $capabilityVersion = filter_var($principal['capability_version'], FILTER_VALIDATE_INT);
    if ($capabilityVersion === false || $capabilityVersion < 1) patzer_auth_denied();
    if ($session !== null && (int) $session['capability_version'] !== $capabilityVersion) patzer_auth_denied();

    $grants = $pdo->prepare('SELECT pc.capability_name,pc.grant_version,pc.scope_json,c.enabled,c.catalog_version FROM patzer_auth_principal_capabilities pc LEFT JOIN patzer_auth_capability_catalog c ON c.capability_name=pc.capability_name WHERE pc.principal_id=? AND pc.revoked_at IS NULL ORDER BY pc.capability_name');
    $grants->execute([$principalId]);
    $capabilities = [];
    $scopes = [];
    foreach ($grants->fetchAll() as $grant) {
        $name = $grant['capability_name'] ?? null;
        if (!is_string($name) || isset($scopes[$name]) || (int) $grant['enabled'] !== 1 || ($grant['catalog_version'] ?? null) !== PATZER_ACCESS_CONTRACT_VERSION || (int) $grant['grant_version'] !== $capabilityVersion) patzer_auth_denied();
        $scopes[$name] = patzer_auth_validate_scope($name, (string) $grant['scope_json'], (string) $principal['user_key']);
        $capabilities[] = $name;
    }
    return [
        'contractVersion' => PATZER_ACCESS_CONTRACT_VERSION,
        'authType' => $authType,
        'principalId' => $principalId,
        'userKey' => (string) $principal['user_key'],
        'tier' => (string) $principal['tier'],
        'capabilityVersion' => $capabilityVersion,
        'capabilities' => $capabilities,
        'scopes' => $scopes,
        'rolloutState' => $rollout['state'],
        'rolloutVersion' => $rollout['stateVersion'],
        'sessionId' => $session['session_id'] ?? null,
        'fingerprint' => $session['session_fingerprint'] ?? null,
        'authContextId' => $session['auth_context_id'] ?? null,
        'sessionIssuedAt' => $session['issued_at'] ?? null,
        'sessionExpiresAt' => $session['expires_at'] ?? null,
        'sessionRevokedAt' => $session['revoked_at'] ?? null,
        'sessionLogoutAt' => $session['logout_at'] ?? null,
    ];
}

function patzer_authenticate_legacy(PDO $pdo, array $config, array $rollout): array {
    $token = patzer_bearer_token();
    if ($token === null) patzer_auth_denied();
    $actual = hash('sha256', $token);
    $matched = null;
    foreach (patzer_sync_token_identities($config) as $identity) {
        if (hash_equals($identity['token_hash'], $actual)) {
            if ($matched !== null) patzer_auth_denied();
            $matched = $identity;
        }
    }
    if ($matched === null) patzer_auth_denied();
    if (in_array($rollout['state'], ['R0-current-legacy','R1-schema-ready','R2-legacy-bootstrapped'], true)) {
        $caps = $matched['compat_capabilities'] ?? patzer_auth_legacy_compat_capabilities((string)$matched['identity']);
        if (!is_array($caps) || array_values(array_unique($caps)) !== array_values($caps)) patzer_auth_denied();
        $publicKnownCapabilities = patzer_auth_known_capabilities();
        if (count(array_diff($caps, $publicKnownCapabilities)) > 0) patzer_auth_denied();
        $tier = $matched['compat_tier'] ?? 'beta';
        if (!in_array($tier, ['beta','public-day'], true)) patzer_auth_denied();
        $scopes = [];
        foreach ($caps as $capability) $scopes[$capability] = ['kind'=>'self'];
        return ['contractVersion'=>PATZER_ACCESS_CONTRACT_VERSION,'authType'=>'legacy-bearer-v1','principalId'=>'legacy:'.$matched['identity'],'userKey'=>$matched['user_key'],'tier'=>$tier,'capabilityVersion'=>1,'capabilities'=>$caps,'scopes'=>$scopes,'rolloutState'=>$rollout['state'],'rolloutVersion'=>$rollout['stateVersion'],'sessionId'=>null,'fingerprint'=>null,'authContextId'=>'ctx_'.hash('sha256', "legacy\0".$matched['identity']."\0".$matched['user_key']),'sessionIssuedAt'=>null,'sessionExpiresAt'=>null,'sessionRevokedAt'=>null,'sessionLogoutAt'=>null];
    }
    if (!in_array($rollout['state'], ['R3-compatible-deployed','R4-disposable-auth-probe','R5-fail-closed-v2','R6-isolated-test','R7-gate-a-ready','R8-controlled-beta','RB-beta-maintenance','RB-legacy-compat'], true)) patzer_auth_denied();
    $binding = $pdo->prepare('SELECT legacy_identity,principal_id,user_key,legacy_token_hash,legacy_fingerprint,enabled,expires_at,mapping_version,bootstrap_hash FROM patzer_auth_legacy_bindings WHERE legacy_identity=? LIMIT 2');
    $binding->execute([$matched['identity']]);
    $rows = $binding->fetchAll();
    if (count($rows) !== 1) patzer_auth_denied();
    $row = $rows[0];
    $configTier = $matched['compat_tier'] ?? null;
    $configCapabilities = $matched['compat_capabilities'] ?? null;
    $expectedFingerprint = $config['auth_legacy_fingerprints'][$matched['identity']] ?? null;
    $expectedBootstrapHash = $config['auth_legacy_bootstrap_hashes'][$matched['identity']] ?? null;
    if ((int) $row['enabled'] !== 1 || (int)($row['mapping_version'] ?? 0) < 1 ||
        !is_string($row['legacy_identity'] ?? null) || !hash_equals($matched['identity'], $row['legacy_identity']) ||
        !is_string($configTier) || !in_array($configTier, ['admin','agent'], true) ||
        !is_array($configCapabilities) || array_values(array_unique($configCapabilities)) !== array_values($configCapabilities) ||
        count(array_diff($configCapabilities, patzer_auth_known_capabilities())) > 0 ||
        !is_string($expectedFingerprint) || !is_string($expectedBootstrapHash) ||
        !hash_equals($expectedFingerprint, (string)($row['legacy_fingerprint'] ?? '')) ||
        !hash_equals($expectedBootstrapHash, (string)($row['bootstrap_hash'] ?? '')) ||
        preg_match('/^hmac-sha256:[a-f0-9]{64}$/', (string)($row['legacy_fingerprint'] ?? '')) !== 1 ||
        preg_match('/^sha256:[a-f0-9]{64}$/', (string)($row['bootstrap_hash'] ?? '')) !== 1 ||
        !hash_equals($actual, (string) $row['legacy_token_hash']) ||
        !hash_equals((string) $matched['user_key'], (string) $row['user_key']) ||
        ($row['expires_at'] !== null && strtotime((string) $row['expires_at']) <= time())) patzer_auth_denied();
    $context = patzer_auth_load_principal($pdo, (string) $row['principal_id'], $rollout, 'legacy-bearer-v1');
    $sortedConfigCapabilities = $configCapabilities;
    sort($sortedConfigCapabilities);
    if (!hash_equals($context['userKey'], (string) $row['user_key']) ||
        !in_array($context['tier'], ['admin','agent'], true) || !hash_equals($configTier, $context['tier']) ||
        $sortedConfigCapabilities !== $context['capabilities']) patzer_auth_denied();
    $context['fingerprint'] = (string)$row['legacy_fingerprint'];
    $context['authContextId'] = 'ctx_' . hash('sha256', "legacy\0".$row['legacy_identity']."\0".$row['legacy_fingerprint']);
    return $context;
}

function patzer_authenticate_session(PDO $pdo, array $config, array $rollout, bool $allowTerminal = false, bool $lifecycleOnly = false, bool $softUnknown = false): ?array {
    if (!patzer_session_config_is_valid($config)) return null;
    $cookieName = $config['auth_session_cookie_name'] ?? null;
    if (!is_string($cookieName) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $cookieName)) return null;
    $cookieHeader = (string)($_SERVER['HTTP_COOKIE'] ?? '');
    $matches = [];
    preg_match_all('/(?:^|;\s*)' . preg_quote($cookieName, '/') . '=([^;]*)/', $cookieHeader, $matches);
    $cookieCount = count($matches[1] ?? []);
    if ($cookieCount > 1) patzer_auth_denied();
    if ($cookieCount === 0) return null;
    if ($rollout['state'] === 'RB-beta-maintenance') {
        header('Retry-After: 300');
        patzer_json(503, ['ok'=>false,'error'=>'auth-rollout-maintenance']);
    }
    $enabledStates = $lifecycleOnly
        ? ['R4-disposable-auth-probe','R5-fail-closed-v2','R6-isolated-test','R7-gate-a-ready','R8-controlled-beta']
        : ['R5-fail-closed-v2','R6-isolated-test','R7-gate-a-ready','R8-controlled-beta'];
    if (!in_array($rollout['state'], $enabledStates, true)) patzer_auth_denied();
    $secret = rawurldecode((string)$matches[1][0]);
    $pepper = $config['auth_session_pepper'] ?? null;
    if ($secret === '' || !is_string($pepper) || $pepper === '') {
        if ($softUnknown) return null;
        patzer_auth_denied();
    }
    $hash = hash_hmac('sha256', $secret, $pepper);
    $stmt = $pdo->prepare('SELECT session_id,principal_id,capability_version,issued_at,expires_at,revoked_at,logout_at,status,hash_algorithm,hash_key_id,session_fingerprint,auth_context_id FROM patzer_auth_sessions WHERE session_hash=? LIMIT 2');
    $stmt->execute([$hash]);
    $rows = $stmt->fetchAll();
    if (count($rows) !== 1) {
        if ($softUnknown) return null;
        patzer_auth_denied();
    }
    $session = $rows[0];
    $expectedFingerprint = 'sha256:' . hash('sha256', $secret);
    $sessionIssuedAt = patzer_auth_database_time($session['issued_at'] ?? null);
    $sessionExpiresAt = patzer_auth_database_time($session['expires_at'] ?? null);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $validStatus = ($session['status'] ?? null) === 'active' || ($allowTerminal && in_array($session['status'] ?? null, ['logged-out','revoked','expired'], true));
    if (!$validStatus || ($session['hash_algorithm'] ?? null) !== 'hmac-sha256-v1' ||
        preg_match('/^ses_[A-Za-z0-9_-]{32,60}$/', (string)($session['session_id'] ?? '')) !== 1 ||
        !is_string($session['hash_key_id'] ?? null) || !hash_equals((string)($config['auth_session_key_id'] ?? ''), (string)$session['hash_key_id']) ||
        preg_match('/^sha256:[a-f0-9]{64}$/', (string)($session['session_fingerprint'] ?? '')) !== 1 ||
        !hash_equals($expectedFingerprint, (string)$session['session_fingerprint']) ||
        preg_match('/^ctx_[A-Za-z0-9_-]{32,92}$/', (string)($session['auth_context_id'] ?? '')) !== 1 ||
        (!$allowTerminal && ($session['revoked_at'] !== null || $session['logout_at'] !== null)) ||
        $sessionIssuedAt > $now || $sessionExpiresAt <= $now) {
        if ($softUnknown) return null;
        patzer_auth_denied();
    }
    $context = patzer_auth_load_principal($pdo, (string)$session['principal_id'], $rollout, 'session-v1', $session);
    if (in_array($rollout['state'], ['R4-disposable-auth-probe','R6-isolated-test','R8-controlled-beta'], true) &&
        !patzer_session_rollout_principal_allowed($config, $rollout['state'], $context['principalId'])) {
        if ($softUnknown) return null;
        patzer_auth_denied();
    }
    $context['_csrfToken'] = patzer_session_csrf_token_for_secret($context, $config, $secret);
    $context['_sessionStatus'] = (string)$session['status'];
    return $context;
}

require_once __DIR__ . '/_session.php';

function patzer_authenticate_request(): array {
    $config = patzer_config();
    $pdo = patzer_db_request($config);
    $rollout = patzer_auth_rollout($pdo, $config);
    $session = patzer_authenticate_session($pdo, $config, $rollout);
    $context = $session ?? patzer_authenticate_legacy($pdo, $config, $rollout);
    $config['auth_context'] = $context;
    $config['auth_identity'] = $context['principalId'];
    $config['user_key'] = $context['userKey'];
    $config['request_pdo'] = $pdo;
    unset($config['sync_tokens']);
    return $config;
}
