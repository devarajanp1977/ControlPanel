// internal/auth/auth.go — agent-side source of truth for operators and sessions.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aegis/aegis-agent/internal/audit"
	"github.com/aegis/aegis-agent/internal/store"
	"github.com/google/uuid"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/argon2"
)

type Role string

const (
	RoleOwner    Role = "owner"
	RoleAdmin    Role = "admin"
	RoleOperator Role = "operator"
	RoleReadonly Role = "readonly"

	idleSessionTTL = 30 * time.Minute
	hardSessionTTL = 12 * time.Hour
)

var validRoles = map[Role]struct{}{
	RoleOwner:    {},
	RoleAdmin:    {},
	RoleOperator: {},
	RoleReadonly: {},
}

type Service struct {
	db      *store.DB
	auditor *audit.Auditor
}

type Operator struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	DisplayName string     `json:"display_name"`
	Role        Role       `json:"role"`
	CreatedAt   time.Time  `json:"created_at"`
	DisabledAt  *time.Time `json:"disabled_at,omitempty"`
}

type SetupStatus struct {
	Initialized   bool `json:"initialized"`
	OperatorCount int  `json:"operator_count"`
}

type PasskeyCredential struct {
	ID          string   `json:"id"`
	PublicKey   []byte   `json:"public_key"`
	Attestation []byte   `json:"attestation,omitempty"`
	SignCount   int64    `json:"sign_count"`
	Transports  []string `json:"transports,omitempty"`
	Nickname    string   `json:"nickname"`
}

type BootstrapInput struct {
	Username       string            `json:"username"`
	DisplayName    string            `json:"display_name"`
	Role           Role              `json:"role"`
	TotpSecret     string            `json:"totp_secret"`
	RecoveryCodes  []string          `json:"recovery_codes"`
	Passkey        PasskeyCredential `json:"passkey"`
	SourceIP       string            `json:"source_ip"`
	SessionAgent   string            `json:"session_agent"`
	SessionIP      string            `json:"session_ip"`
	IssueSession   bool              `json:"issue_session"`
}

type SessionInput struct {
	OperatorID string `json:"operator_id"`
	IP         string `json:"ip"`
	UserAgent  string `json:"user_agent"`
}

type ValidateSessionInput struct {
	ID        string `json:"id"`
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
}

type Session struct {
	ID         string      `json:"id"`
	OperatorID string      `json:"operator_id"`
	IP         string      `json:"ip"`
	UserAgent  string      `json:"user_agent"`
	CreatedAt  time.Time   `json:"created_at"`
	LastSeen   time.Time   `json:"last_seen"`
	ExpiresAt  time.Time   `json:"expires_at"`
	RevokedAt  *time.Time  `json:"revoked_at,omitempty"`
	Operator   *Operator   `json:"operator,omitempty"`
}

type BootstrapResult struct {
	Operator *Operator `json:"operator"`
	Session  *Session  `json:"session,omitempty"`
}

type LoginLookup struct {
	Operator    *Operator            `json:"operator"`
	Credentials []PasskeyCredential  `json:"credentials"`
}

type CompletePasskeyLoginInput struct {
	Username     string `json:"username"`
	CredentialID string `json:"credential_id"`
	SignCount    int64  `json:"sign_count"`
	IP           string `json:"ip"`
	UserAgent    string `json:"user_agent"`
}

type VerifyCodeInput struct {
	Username  string `json:"username"`
	Code      string `json:"code"`
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
}

type recoveryHash struct {
	Salt string `json:"salt"`
	Hash string `json:"hash"`
}

func New(db *store.DB, auditor *audit.Auditor) (*Service, error) {
	if db == nil {
		return nil, errors.New("auth db is required")
	}
	if auditor == nil {
		return nil, errors.New("auditor is required")
	}
	return &Service{db: db, auditor: auditor}, nil
}

func (s *Service) SetupStatus(ctx context.Context) (SetupStatus, error) {
	count, err := s.operatorCount(ctx)
	if err != nil {
		return SetupStatus{}, err
	}
	return SetupStatus{Initialized: count > 0, OperatorCount: count}, nil
}

func (s *Service) BootstrapOperator(ctx context.Context, in BootstrapInput) (*BootstrapResult, error) {
	username := strings.TrimSpace(strings.ToLower(in.Username))
	displayName := strings.TrimSpace(in.DisplayName)
	role := in.Role
	if role == "" {
		role = RoleOwner
	}
	if _, ok := validRoles[role]; !ok {
		return nil, fmt.Errorf("invalid role %q", role)
	}
	if username == "" {
		return nil, errors.New("username is required")
	}
	if displayName == "" {
		displayName = username
	}
	if strings.TrimSpace(in.TotpSecret) == "" {
		return nil, errors.New("totp_secret is required")
	}
	if len(in.RecoveryCodes) == 0 {
		return nil, errors.New("at least one recovery code is required")
	}
	if strings.TrimSpace(in.Passkey.ID) == "" || len(in.Passkey.PublicKey) == 0 {
		return nil, errors.New("passkey credential is required")
	}
	if count, err := s.operatorCount(ctx); err != nil {
		return nil, err
	} else if count > 0 {
		return nil, errors.New("bootstrap already completed")
	}

	totpSealed, err := s.db.Seal([]byte(in.TotpSecret), "totp:"+username)
	if err != nil {
		return nil, err
	}
	recoveryJSON, err := encodeRecoveryCodes(in.RecoveryCodes)
	if err != nil {
		return nil, err
	}
	transportsJSON, err := json.Marshal(in.Passkey.Transports)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	op := &Operator{
		ID:          uuid.NewString(),
		Username:    username,
		DisplayName: displayName,
		Role:        role,
		CreatedAt:   now,
	}

	if err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO operators (id, username, display_name, role, totp_secret_enc, recovery_hashes, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, op.ID, op.Username, op.DisplayName, string(op.Role), totpSealed, recoveryJSON, now.UnixMilli())
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO webauthn_credentials (id, operator_id, public_key, attestation, sign_count, transports, nickname, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, in.Passkey.ID, op.ID, in.Passkey.PublicKey, in.Passkey.Attestation, in.Passkey.SignCount, string(transportsJSON), nonEmpty(in.Passkey.Nickname, "Primary passkey"), now.UnixMilli())
		return err
	}); err != nil {
		return nil, err
	}

	if err := s.auditor.Log(ctx, audit.Entry{
		Actor:     op.Username,
		ActorKind: "operator",
		SourceIP:  in.SourceIP,
		Action:    "auth.bootstrap",
		Resource:  "operators/" + op.ID,
		After: map[string]any{
			"id":           op.ID,
			"username":     op.Username,
			"role":         op.Role,
			"passkey_id":   in.Passkey.ID,
			"recovery_size": len(in.RecoveryCodes),
		},
	}); err != nil {
		return nil, err
	}

	res := &BootstrapResult{Operator: op}
	if in.IssueSession {
		session, err := s.CreateSession(ctx, SessionInput{OperatorID: op.ID, IP: nonEmpty(in.SessionIP, in.SourceIP), UserAgent: in.SessionAgent})
		if err != nil {
			return nil, err
		}
		res.Session = session
	}
	return res, nil
}

func (s *Service) ListOperators(ctx context.Context) ([]Operator, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, username, display_name, role, created_at, disabled_at FROM operators ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	operators := make([]Operator, 0)
	for rows.Next() {
		op, err := scanOperator(rows)
		if err != nil {
			return nil, err
		}
		operators = append(operators, op)
	}
	return operators, rows.Err()
}

func (s *Service) CreateSession(ctx context.Context, in SessionInput) (*Session, error) {
	if strings.TrimSpace(in.OperatorID) == "" {
		return nil, errors.New("operator_id is required")
	}
	if strings.TrimSpace(in.IP) == "" {
		return nil, errors.New("ip is required")
	}
	if strings.TrimSpace(in.UserAgent) == "" {
		return nil, errors.New("user_agent is required")
	}
	op, err := s.operatorByID(ctx, in.OperatorID)
	if err != nil {
		return nil, err
	}
	if op.DisabledAt != nil {
		return nil, errors.New("operator disabled")
	}

	id, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	expiresAt := now.Add(idleSessionTTL)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO sessions (id, operator_id, ip, user_agent, created_at, last_seen, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, id, in.OperatorID, in.IP, in.UserAgent, now.UnixMilli(), now.UnixMilli(), expiresAt.UnixMilli())
	if err != nil {
		return nil, err
	}

	sess := &Session{
		ID:         id,
		OperatorID: in.OperatorID,
		IP:         in.IP,
		UserAgent:  in.UserAgent,
		CreatedAt:  now,
		LastSeen:   now,
		ExpiresAt:  expiresAt,
		Operator:   op,
	}
	if err := s.auditor.Log(ctx, audit.Entry{
		Actor:     op.Username,
		ActorKind: "operator",
		SourceIP:  in.IP,
		Action:    "auth.session.create",
		Resource:  "sessions/" + id,
		After: map[string]any{
			"operator_id": op.ID,
			"expires_at":  expiresAt,
		},
	}); err != nil {
		return nil, err
	}
	return sess, nil
}

func (s *Service) ValidateSession(ctx context.Context, in ValidateSessionInput) (*Session, error) {
	sess, err := s.sessionByID(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if sess.RevokedAt != nil {
		return nil, errors.New("session revoked")
	}
	now := time.Now().UTC()
	if now.After(sess.ExpiresAt) {
		return nil, errors.New("session expired")
	}
	if in.IP != "" && !strings.EqualFold(in.IP, sess.IP) {
		return nil, errors.New("session ip mismatch")
	}
	if in.UserAgent != "" && in.UserAgent != sess.UserAgent {
		return nil, errors.New("session user-agent mismatch")
	}
	maxExpiry := sess.CreatedAt.Add(hardSessionTTL)
	newExpiry := now.Add(idleSessionTTL)
	if newExpiry.After(maxExpiry) {
		newExpiry = maxExpiry
	}
	_, err = s.db.ExecContext(ctx, `UPDATE sessions SET last_seen=?, expires_at=? WHERE id=?`, now.UnixMilli(), newExpiry.UnixMilli(), in.ID)
	if err != nil {
		return nil, err
	}
	sess.LastSeen = now
	sess.ExpiresAt = newExpiry
	return sess, nil
}

func (s *Service) RevokeSession(ctx context.Context, id, sourceIP string) error {
	sess, err := s.sessionByID(ctx, id)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.db.ExecContext(ctx, `UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL`, now.UnixMilli(), id)
	if err != nil {
		return err
	}
	if sess.Operator != nil {
		_ = s.auditor.Log(ctx, audit.Entry{
			Actor:     sess.Operator.Username,
			ActorKind: "operator",
			SourceIP:  sourceIP,
			Action:    "auth.session.revoke",
			Resource:  "sessions/" + id,
		})
	}
	return nil
}

func (s *Service) operatorCount(ctx context.Context) (int, error) {
	row := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM operators`)
	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Service) operatorByID(ctx context.Context, id string) (*Operator, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, username, display_name, role, created_at, disabled_at FROM operators WHERE id=?`, id)
	op, err := scanOperator(row)
	if err != nil {
		return nil, err
	}
	return &op, nil
}

func (s *Service) sessionByID(ctx context.Context, id string) (*Session, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, operator_id, ip, user_agent, created_at, last_seen, expires_at, revoked_at FROM sessions WHERE id=?`, id)
	var (
		sess                           Session
		createdAt, lastSeen, expiresAt int64
		revokedAt                      sql.NullInt64
	)
	if err := row.Scan(&sess.ID, &sess.OperatorID, &sess.IP, &sess.UserAgent, &createdAt, &lastSeen, &expiresAt, &revokedAt); err != nil {
		return nil, err
	}
	sess.CreatedAt = time.UnixMilli(createdAt).UTC()
	sess.LastSeen = time.UnixMilli(lastSeen).UTC()
	sess.ExpiresAt = time.UnixMilli(expiresAt).UTC()
	if revokedAt.Valid {
		t := time.UnixMilli(revokedAt.Int64).UTC()
		sess.RevokedAt = &t
	}
	op, err := s.operatorByID(ctx, sess.OperatorID)
	if err == nil {
		sess.Operator = op
	}
	return &sess, nil
}

type operatorScanner interface {
	Scan(dest ...any) error
}

func scanOperator(scanner operatorScanner) (Operator, error) {
	var (
		op         Operator
		createdAt  int64
		disabledAt sql.NullInt64
	)
	if err := scanner.Scan(&op.ID, &op.Username, &op.DisplayName, &op.Role, &createdAt, &disabledAt); err != nil {
		return Operator{}, err
	}
	op.CreatedAt = time.UnixMilli(createdAt).UTC()
	if disabledAt.Valid {
		t := time.UnixMilli(disabledAt.Int64).UTC()
		op.DisabledAt = &t
	}
	return op, nil
}

func encodeRecoveryCodes(codes []string) (string, error) {
	hashes := make([]recoveryHash, 0, len(codes))
	for _, code := range codes {
		trimmed := strings.TrimSpace(code)
		if trimmed == "" {
			continue
		}
		hash, err := hashRecoveryCode(trimmed)
		if err != nil {
			return "", err
		}
		hashes = append(hashes, hash)
	}
	if len(hashes) == 0 {
		return "", errors.New("recovery codes cannot be empty")
	}
	b, err := json.Marshal(hashes)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func hashRecoveryCode(code string) (recoveryHash, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return recoveryHash{}, err
	}
	hash := argon2.IDKey([]byte(code), salt, 1, 64*1024, 4, 32)
	return recoveryHash{
		Salt: base64.RawURLEncoding.EncodeToString(salt),
		Hash: base64.RawURLEncoding.EncodeToString(hash),
	}, nil
}

func randomToken(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func nonEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func (s *Service) LookupLogin(ctx context.Context, username string) (*LoginLookup, error) {
	operator, err := s.operatorByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	credentials, err := s.listCredentialsByOperator(ctx, operator.ID)
	if err != nil {
		return nil, err
	}
	return &LoginLookup{Operator: operator, Credentials: credentials}, nil
}

func (s *Service) CompletePasskeyLogin(ctx context.Context, in CompletePasskeyLoginInput) (*Session, error) {
	if strings.TrimSpace(in.Username) == "" {
		return nil, errors.New("username is required")
	}
	if strings.TrimSpace(in.CredentialID) == "" {
		return nil, errors.New("credential_id is required")
	}
	if strings.TrimSpace(in.IP) == "" {
		return nil, errors.New("ip is required")
	}
	if strings.TrimSpace(in.UserAgent) == "" {
		return nil, errors.New("user_agent is required")
	}

	operator, err := s.operatorByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	credential, err := s.credentialByID(ctx, operator.ID, in.CredentialID)
	if err != nil {
		return nil, err
	}
	if credential.SignCount > 0 && in.SignCount > 0 && in.SignCount < credential.SignCount {
		return nil, errors.New("credential counter rollback detected")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE webauthn_credentials SET sign_count=?, last_used=? WHERE id=?`, maxInt64(credential.SignCount, in.SignCount), time.Now().UTC().UnixMilli(), in.CredentialID)
	if err != nil {
		return nil, err
	}
	return s.issueAuthenticatedSession(ctx, operator, "auth.passkey.login", in.IP, in.UserAgent, map[string]any{
		"credential_id": in.CredentialID,
		"sign_count":    maxInt64(credential.SignCount, in.SignCount),
		"method":        "passkey",
	})
}

func (s *Service) AuthenticateTOTP(ctx context.Context, in VerifyCodeInput) (*Session, error) {
	if strings.TrimSpace(in.Username) == "" {
		return nil, errors.New("username is required")
	}
	if strings.TrimSpace(in.Code) == "" {
		return nil, errors.New("code is required")
	}
	operator, err := s.operatorByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	secret, err := s.totpSecretForOperator(ctx, operator)
	if err != nil {
		return nil, err
	}
	valid, err := totp.ValidateCustom(strings.TrimSpace(in.Code), secret, time.Now().UTC(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, errors.New("invalid totp code")
	}
	return s.issueAuthenticatedSession(ctx, operator, "auth.totp.login", in.IP, in.UserAgent, map[string]any{
		"method": "totp",
	})
}

func (s *Service) AuthenticateRecoveryCode(ctx context.Context, in VerifyCodeInput) (*Session, error) {
	if strings.TrimSpace(in.Username) == "" {
		return nil, errors.New("username is required")
	}
	if strings.TrimSpace(in.Code) == "" {
		return nil, errors.New("code is required")
	}
	operator, err := s.operatorByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	if err := s.consumeRecoveryCode(ctx, operator, in.Code); err != nil {
		return nil, err
	}
	return s.issueAuthenticatedSession(ctx, operator, "auth.recovery.login", in.IP, in.UserAgent, map[string]any{
		"method": "recovery_code",
	})
}

func (s *Service) operatorByUsername(ctx context.Context, username string) (*Operator, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, username, display_name, role, created_at, disabled_at FROM operators WHERE lower(username)=lower(?)`, strings.TrimSpace(username))
	op, err := scanOperator(row)
	if err != nil {
		return nil, err
	}
	return &op, nil
}

func (s *Service) listCredentialsByOperator(ctx context.Context, operatorID string) ([]PasskeyCredential, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, public_key, attestation, sign_count, transports, nickname FROM webauthn_credentials WHERE operator_id=? ORDER BY created_at ASC`, operatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	credentials := make([]PasskeyCredential, 0)
	for rows.Next() {
		var (
			credential PasskeyCredential
			transports string
		)
		if err := rows.Scan(&credential.ID, &credential.PublicKey, &credential.Attestation, &credential.SignCount, &transports, &credential.Nickname); err != nil {
			return nil, err
		}
		if transports != "" {
			_ = json.Unmarshal([]byte(transports), &credential.Transports)
		}
		credentials = append(credentials, credential)
	}
	return credentials, rows.Err()
}

func (s *Service) credentialByID(ctx context.Context, operatorID, credentialID string) (*PasskeyCredential, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, public_key, attestation, sign_count, transports, nickname FROM webauthn_credentials WHERE operator_id=? AND id=?`, operatorID, credentialID)
	var (
		credential PasskeyCredential
		transports string
	)
	if err := row.Scan(&credential.ID, &credential.PublicKey, &credential.Attestation, &credential.SignCount, &transports, &credential.Nickname); err != nil {
		return nil, err
	}
	if transports != "" {
		_ = json.Unmarshal([]byte(transports), &credential.Transports)
	}
	return &credential, nil
}

func (s *Service) totpSecretForOperator(ctx context.Context, operator *Operator) (string, error) {
	row := s.db.QueryRowContext(ctx, `SELECT totp_secret_enc FROM operators WHERE id=?`, operator.ID)
	var sealed []byte
	if err := row.Scan(&sealed); err != nil {
		return "", err
	}
	plain, err := s.db.OpenSealed(sealed, "totp:"+operator.Username)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func (s *Service) consumeRecoveryCode(ctx context.Context, operator *Operator, code string) error {
	row := s.db.QueryRowContext(ctx, `SELECT recovery_hashes FROM operators WHERE id=?`, operator.ID)
	var hashesJSON string
	if err := row.Scan(&hashesJSON); err != nil {
		return err
	}
	var hashes []recoveryHash
	if err := json.Unmarshal([]byte(hashesJSON), &hashes); err != nil {
		return err
	}
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return errors.New("recovery code is required")
	}

	matchedIndex := -1
	for index, item := range hashes {
		ok, err := compareRecoveryCode(trimmed, item)
		if err != nil {
			return err
		}
		if ok {
			matchedIndex = index
			break
		}
	}
	if matchedIndex == -1 {
		return errors.New("invalid recovery code")
	}
	remaining := append([]recoveryHash{}, hashes[:matchedIndex]...)
	remaining = append(remaining, hashes[matchedIndex+1:]...)
	if len(remaining) == 0 {
		return errors.New("no recovery codes remain after using this code; generate a fresh set before proceeding")
	}
	updated, err := json.Marshal(remaining)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE operators SET recovery_hashes=? WHERE id=?`, string(updated), operator.ID)
	return err
}

func (s *Service) issueAuthenticatedSession(ctx context.Context, operator *Operator, action, sourceIP, userAgent string, after map[string]any) (*Session, error) {
	if err := s.auditor.Log(ctx, audit.Entry{
		Actor:     operator.Username,
		ActorKind: "operator",
		SourceIP:  sourceIP,
		Action:    action,
		Resource:  "operators/" + operator.ID,
		After:     after,
	}); err != nil {
		return nil, err
	}
	return s.CreateSession(ctx, SessionInput{OperatorID: operator.ID, IP: sourceIP, UserAgent: userAgent})
}

func compareRecoveryCode(code string, item recoveryHash) (bool, error) {
	salt, err := base64.RawURLEncoding.DecodeString(item.Salt)
	if err != nil {
		return false, err
	}
	expected, err := base64.RawURLEncoding.DecodeString(item.Hash)
	if err != nil {
		return false, err
	}
	derived := argon2.IDKey([]byte(code), salt, 1, 64*1024, 4, uint32(len(expected)))
	return subtle.ConstantTimeCompare(derived, expected) == 1, nil
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}