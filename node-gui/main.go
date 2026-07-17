//go:build desktop

package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:            "Project Colony",
		Width:            1120,
		Height:           760,
		MinWidth:         900,
		MinHeight:        600,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 24, G: 29, B: 48, A: 255}, // Colony Navy #181D30
		OnStartup:        app.startup,
		Bind:             []any{app},
	})
	if err != nil {
		log.Fatalf("wails: %v", err)
	}
}
