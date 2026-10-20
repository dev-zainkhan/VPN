package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/crypto/curve25519"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// What the app remembers between starts, in %LOCALAPPDATA%\RaazVPN\state.json.
// The device token and the WireGuard private key are encrypted with Windows DPAPI for this user.
type State struct {
	DeviceID   string `json:"deviceId"`
	Token      string `json:"token"`      // DPAPI, base64
	PrivateKey string `json:"privateKey"` // DPAPI, base64
	Protocol   string `json:"protocol"`   // auto | udp | tcp
	KillSwitch bool   `json:"killSwitch"`
	LastGood   string `json:"lastGood"` // protocol that worked last time in Auto mode
	Region     string `json:"region"`   // region code, or "" for the fastest
}

func stateDir() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "RaazVPN")
}

func loadState() *State {
	s := &State{Protocol: "auto"}
	b, err := os.ReadFile(filepath.Join(stateDir(), "state.json"))
	if err == nil {
		_ = json.Unmarshal(b, s)
	}
	if s.Protocol == "" {
		s.Protocol = "auto"
	}
	return s
}

func (s *State) save() error {
	if err := os.MkdirAll(stateDir(), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := filepath.Join(stateDir(), "state.json.tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(stateDir(), "state.json"))
}

func (s *State) secret(field string) string {
	raw, err := base64.StdEncoding.DecodeString(field)
	if err != nil || len(raw) == 0 {
		return ""
	}
	plain, err := unprotect(raw)
	if err != nil {
		return ""
	}
	return string(plain)
}

func sealSecret(v string) string {
	b, err := protect([]byte(v))
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(b)
}

// Spec 8.2: the abuse key ties the free minutes to the computer, not to one install.
// The backend only ever sees this one-way hash, and hashes it again with its own secret.
func abuseKey() string {
	id := "unknown"
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err == nil {
		if v, _, e := k.GetStringValue("MachineGuid"); e == nil && v != "" {
			id = v
		}
		k.Close()
	}
	sum := sha256.Sum256([]byte(id + ":raaz-desktop-v1"))
	return hex.EncodeToString(sum[:])
}

// WireGuard keys: Curve25519, base64 like wg genkey / wg pubkey.
func generatePrivateKey() (string, error) {
	var k [32]byte
	if _, err := rand.Read(k[:]); err != nil {
		return "", err
	}
	k[0] &= 248
	k[31] = (k[31] & 127) | 64
	return base64.StdEncoding.EncodeToString(k[:]), nil
}

func publicKeyFor(private string) (string, error) {
	k, err := base64.StdEncoding.DecodeString(private)
	if err != nil || len(k) != 32 {
		return "", errors.New("bad private key")
	}
	pub, err := curve25519.X25519(k, curve25519.Basepoint)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(pub), nil
}

func protect(b []byte) ([]byte, error) {
	if len(b) == 0 {
		return nil, errors.New("empty")
	}
	in := windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
	var out windows.DataBlob
	if err := windows.CryptProtectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}

func unprotect(b []byte) ([]byte, error) {
	in := windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}
