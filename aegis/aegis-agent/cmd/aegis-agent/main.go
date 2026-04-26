// cmd/aegis-agent/main.go — entrypoint. Wires the store, services, and the
// UDS HTTP server. Connect-protocol over JSON; never binds to a TCP port.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/aegis/aegis-agent/internal/audit"
	"github.com/aegis/aegis-agent/internal/auth"
	"github.com/aegis/aegis-agent/internal/jobs"
	logview "github.com/aegis/aegis-agent/internal/logs"
	"github.com/aegis/aegis-agent/internal/rpc"
	servicecontrol "github.com/aegis/aegis-agent/internal/services"
	"github.com/aegis/aegis-agent/internal/store"
	"github.com/aegis/aegis-agent/internal/system"
)

func main() {
	dev := flag.Bool("dev", false, "run in dev mode (socket in cwd, master key auto-created)")
	sockPath := flag.String("socket", "/run/aegis/aegis.sock", "unix socket path")
	dataDir := flag.String("data", "/var/lib/aegis", "data directory")
	keyPath := flag.String("key", "/etc/aegis/master.key", "master key path")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if *dev {
		cwd, _ := os.Getwd()
		*sockPath = filepath.Join(cwd, "aegis.sock")
		*dataDir = filepath.Join(cwd, "var")
		*keyPath = filepath.Join(cwd, "var", "master.key")
		_ = os.MkdirAll(*dataDir, 0o750)
	}

	if err := run(*sockPath, *dataDir, *keyPath); err != nil {
		logger.Error("agent exited with error", "err", err)
		os.Exit(1)
	}
}

func run(sockPath, dataDir, keyPath string) error {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	master, err := store.LoadOrCreateMasterKey(keyPath)
	if err != nil {
		return err
	}

	db, err := store.Open(filepath.Join(dataDir, "aegis.db"), master)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := store.Migrate(ctx, db); err != nil {
		return err
	}

	auditor := audit.New(db)
	jobRunner := jobs.New(db, 4)
	jobRunner.Start(ctx)
	logManager := logview.New()
	serviceManager := servicecontrol.New()
	systemSvc := system.New()

	authSvc, err := auth.New(db, auditor)
	if err != nil {
		return err
	}

	mux := rpc.NewMux(rpc.Deps{
		DB:      db,
		Audit:   auditor,
		Jobs:    jobRunner,
		Logs:    logManager,
		Auth:    authSvc,
		Services: serviceManager,
		System:  systemSvc,
		DataDir: dataDir,
	})

	_ = os.MkdirAll(filepath.Dir(sockPath), 0o750)
	_ = os.Remove(sockPath)
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		return err
	}
	if err := os.Chmod(sockPath, 0o660); err != nil {
		return err
	}
	slog.Info("agent listening", "socket", sockPath)

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = srv.Shutdown(shutdownCtx)
	}()

	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
