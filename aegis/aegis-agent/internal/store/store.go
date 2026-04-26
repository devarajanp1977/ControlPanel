// internal/store/store.go — sqlite open + master-key load + secret-box helpers.
// Pure-Go sqlite (modernc) so no CGO. Master key is 32 bytes, mode 0400, root-only.
package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/crypto/chacha20poly1305"
	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
	master []byte
}

func Open(path string, master []byte) (*DB, error) {
	if len(master) != 32 {
		return nil, errors.New("master key must be 32 bytes")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)", path)
	sdb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := sdb.Ping(); err != nil {
		return nil, err
	}
	sdb.SetMaxOpenConns(1) // sqlite single-writer; reads are fine here for simplicity
	return &DB{DB: sdb, master: master}, nil
}

func LoadOrCreateMasterKey(path string) ([]byte, error) {
	b, err := os.ReadFile(path)
	if err == nil {
		if len(b) != 32 {
			return nil, fmt.Errorf("master key at %s has wrong length %d", path, len(b))
		}
		return b, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, key, 0o400); err != nil {
		return nil, err
	}
	return key, nil
}

// Seal encrypts a plaintext for at-rest storage. Returns nonce||ciphertext.
func (db *DB) Seal(plaintext []byte, context string) ([]byte, error) {
	aead, err := chacha20poly1305.NewX(deriveKey(db.master, context))
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ct := aead.Seal(nil, nonce, plaintext, nil)
	out := make([]byte, 0, len(nonce)+len(ct))
	out = append(out, nonce...)
	out = append(out, ct...)
	return out, nil
}

// Open decrypts a previously sealed value.
func (db *DB) OpenSealed(sealed []byte, context string) ([]byte, error) {
	aead, err := chacha20poly1305.NewX(deriveKey(db.master, context))
	if err != nil {
		return nil, err
	}
	if len(sealed) < aead.NonceSize() {
		return nil, errors.New("sealed value too short")
	}
	nonce, ct := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	return aead.Open(nil, nonce, ct, nil)
}

// Master returns a copy of the master key. Avoid using outside the auth/HMAC paths.
func (db *DB) Master() []byte {
	c := make([]byte, len(db.master))
	copy(c, db.master)
	return c
}

func deriveKey(master []byte, context string) []byte {
	h := sha256.New()
	h.Write(master)
	h.Write([]byte("aegis/v1/"))
	h.Write([]byte(context))
	return h.Sum(nil)
}

// Tx is a small helper for transactional callbacks.
func (db *DB) Tx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
