package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Device API (backend spec section 8), the same calls the Android app makes.

type Session struct {
	SessionID  string `json:"sessionId"`
	RegionCode string `json:"regionCode"`
	Protocol   string `json:"protocol"`
	StartedAt  string `json:"startedAt"`
}

type Me struct {
	DeviceID       string   `json:"deviceId"`
	BalanceSeconds int64    `json:"balanceSeconds"`
	Blocked        bool     `json:"blocked"`
	Session        *Session `json:"session"`
}

type AppConfig struct {
	DailyFreeMinutes         int    `json:"dailyFreeMinutes"`
	NextDailyRefillAt        string `json:"nextDailyRefillAt"`
	LowMinutesWarningSeconds int    `json:"lowMinutesWarningSeconds"`
	DefaultProtocol          string `json:"defaultProtocol"`
	SupportEmail             string `json:"supportEmail"`
	TCPLocalPort             int    `json:"tcpLocalPort"`
}

type Region struct {
	Code        string `json:"code"`
	DisplayName string `json:"displayName"`
	CountryCode string `json:"countryCode"`
	PingHost    string `json:"pingHost"`
	PingPort    int    `json:"pingPort"`
}

type ConnectResponse struct {
	SessionID string `json:"sessionId"`
	Server    struct {
		ID         string `json:"id"`
		RegionCode string `json:"regionCode"`
		PublicIP   string `json:"publicIp"`
	} `json:"server"`
	WireGuard struct {
		Address string   `json:"address"`
		DNS     []string `json:"dns"`
		MTU     int      `json:"mtu"`
		Peer    struct {
			PublicKey           string   `json:"publicKey"`
			Endpoint            string   `json:"endpoint"`
			AllowedIPs          []string `json:"allowedIps"`
			PersistentKeepalive int      `json:"persistentKeepalive"`
		} `json:"peer"`
	} `json:"wireguard"`
	TCP *struct {
		Host       string `json:"host"`
		Port       int    `json:"port"`
		CertSha256 string `json:"certSha256"`
	} `json:"tcp"`
	BalanceSeconds int64 `json:"balanceSeconds"`
}

type registerResponse struct {
	DeviceID    string `json:"deviceId"`
	DeviceToken string `json:"deviceToken"`
}

type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string { return e.Message }

func isAuthError(err error) bool {
	e, ok := err.(*APIError)
	return ok && (e.Code == "AUTH_INVALID" || e.Code == "AUTH_REQUIRED")
}

type apiClient struct {
	base  string
	token string
	http  *http.Client
}

func newAPIClient(base string) *apiClient {
	return &apiClient{base: base, http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *apiClient) do(method, path string, body, out interface{}) error {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.base+"/api/v1"+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return &APIError{Code: "NETWORK", Message: "Cannot reach the Raaz server. Check your internet connection."}
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		var e struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		if e.Error.Code == "" {
			e.Error.Code, e.Error.Message = "INTERNAL", fmt.Sprintf("Something went wrong (HTTP %d)", res.StatusCode)
		}
		return &APIError{Status: res.StatusCode, Code: e.Error.Code, Message: e.Error.Message}
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (c *apiClient) register(abuseKey string) (*registerResponse, error) {
	var r registerResponse
	err := c.do("POST", "/devices/register", map[string]string{"abuseKey": abuseKey, "platform": "windows", "appVersion": version}, &r)
	return &r, err
}

func (c *apiClient) me() (*Me, error) {
	var r Me
	return &r, c.do("GET", "/me", nil, &r)
}

func (c *apiClient) config() (*AppConfig, error) {
	var r AppConfig
	return &r, c.do("GET", "/config", nil, &r)
}

func (c *apiClient) regions() ([]Region, error) {
	var r struct {
		Items []Region `json:"items"`
	}
	return r.Items, c.do("GET", "/regions", nil, &r)
}

func (c *apiClient) connect(region, protocol, publicKey string) (*ConnectResponse, error) {
	var r ConnectResponse
	return &r, c.do("POST", "/connect", map[string]string{"regionCode": region, "protocol": protocol, "publicKey": publicKey}, &r)
}

func (c *apiClient) disconnect() error {
	return c.do("POST", "/disconnect", map[string]string{}, nil)
}
