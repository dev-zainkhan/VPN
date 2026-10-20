package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"golang.org/x/sys/windows/svc/eventlog"
)

//go:embed all:frontend/dist
var assets embed.FS

// Set at build time with -ldflags "-X main.apiBase=... -X main.version=...".
var (
	apiBase = "https://13-126-168-194.sslip.io"
	version = "1.0.0"
)

func main() {
	// The same program runs as the Windows service that holds the tunnel:
	//   RaazVPN.exe /service <config file> [--tcp=host,port,sha256,localPort]
	if len(os.Args) >= 3 && os.Args[1] == "/service" {
		runTunnelService(os.Args[2], os.Args[3:])
		return
	}

	app := newApp()
	err := wails.Run(&options.App{
		Title:            "Raaz VPN",
		Width:            420,
		Height:           760,
		MinWidth:         380,
		MinHeight:        660,
		BackgroundColour: &options.RGBA{R: 9, G: 13, B: 18, A: 255},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		OnBeforeClose:    app.beforeClose,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "raazvpn-desktop-6f1c",
			OnSecondInstanceLaunch: app.onSecondInstance,
		},
		Bind: []interface{}{app},
		Windows: &windows.Options{
			Theme: windows.Dark,
		},
	})
	if err != nil {
		if l, e := eventlog.Open("Application"); e == nil {
			_ = l.Error(1, "Raaz VPN: "+err.Error())
			_ = l.Close()
		}
		os.Exit(1)
	}
}
