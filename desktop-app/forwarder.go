package main

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// TCP mode (spec 11.5), the same protocol as the Android TcpForwarder: WireGuard sends UDP to
// 127.0.0.1:local; each datagram goes to the server inside one TLS connection as a 2-byte
// length + payload frame, and replies come back the same way. No certificate authority is
// trusted; the server certificate must match the SHA-256 pin from the connect response.
const maxFrame = 1500

var errPin = errors.New("server certificate does not match")

type forwarder struct {
	host  string
	port  int
	pin   string
	local int
	log   *log.Logger
}

func (f *forwarder) run() {
	udp, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: f.local})
	if err != nil {
		f.log.Printf("tcp mode: cannot listen on 127.0.0.1:%d: %v", f.local, err)
		return
	}
	var peer atomic.Pointer[net.UDPAddr]
	var cur atomic.Pointer[tls.Conn]
	var writeMu sync.Mutex

	go func() {
		buf := make([]byte, maxFrame+2)
		for {
			n, addr, err := udp.ReadFromUDP(buf[2:])
			if err != nil {
				return
			}
			peer.Store(addr)
			if n <= 0 || n > maxFrame {
				continue
			}
			c := cur.Load()
			if c == nil {
				continue
			}
			buf[0], buf[1] = byte(n>>8), byte(n)
			writeMu.Lock()
			_ = c.SetWriteDeadline(time.Now().Add(10 * time.Second))
			_, err = c.Write(buf[:n+2])
			writeMu.Unlock()
			if err != nil {
				_ = c.Close()
			}
		}
	}()

	delay := time.Second
	for {
		c, err := f.dial()
		if err != nil {
			f.log.Printf("tcp mode: %v", err)
			if errors.Is(err, errPin) {
				delay = 30 * time.Second
			}
			time.Sleep(delay)
			if delay < 15*time.Second {
				delay *= 2
			}
			continue
		}
		delay = time.Second
		cur.Store(c)
		err = f.pump(c, udp, &peer)
		cur.CompareAndSwap(c, nil)
		_ = c.Close()
		f.log.Printf("tcp mode: connection lost: %v", err)
	}
}

func (f *forwarder) dial() (*tls.Conn, error) {
	cfg := &tls.Config{
		InsecureSkipVerify: true, // the pin below is the only check
		MinVersion:         tls.VersionTLS12,
		VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			if len(raw) == 0 {
				return errPin
			}
			sum := sha256.Sum256(raw[0])
			if hex.EncodeToString(sum[:]) != f.pin {
				return errPin
			}
			return nil
		},
	}
	d := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	c, err := tls.DialWithDialer(d, "tcp", net.JoinHostPort(f.host, strconv.Itoa(f.port)), cfg)
	if err != nil {
		var ce *tls.CertificateVerificationError
		if errors.As(err, &ce) || errors.Is(err, errPin) {
			return nil, errPin
		}
		return nil, err
	}
	return c, nil
}

func (f *forwarder) pump(c *tls.Conn, udp *net.UDPConn, peer *atomic.Pointer[net.UDPAddr]) error {
	hdr := make([]byte, 2)
	buf := make([]byte, maxFrame)
	for {
		if _, err := io.ReadFull(c, hdr); err != nil {
			return err
		}
		n := int(hdr[0])<<8 | int(hdr[1])
		if n == 0 || n > maxFrame {
			return errors.New("bad frame")
		}
		if _, err := io.ReadFull(c, buf[:n]); err != nil {
			return err
		}
		if p := peer.Load(); p != nil {
			_, _ = udp.WriteToUDP(buf[:n], p)
		}
	}
}
