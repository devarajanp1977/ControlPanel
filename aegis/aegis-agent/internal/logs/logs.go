package logs

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type Manager struct{}

type Snapshot struct {
	GeneratedAt time.Time `json:"generated_at"`
	Sections    []Section `json:"sections"`
}

type Section struct {
	ID          string  `json:"id"`
	Label       string  `json:"label"`
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	Notice      string  `json:"notice,omitempty"`
	Lines       []Entry `json:"lines"`
}

type Entry struct {
	Timestamp string `json:"timestamp,omitempty"`
	Source    string `json:"source,omitempty"`
	Level     string `json:"level,omitempty"`
	Summary   string `json:"summary"`
	Raw       string `json:"raw"`
}

func New() *Manager { return &Manager{} }

func (m *Manager) Snapshot(ctx context.Context, limit int) Snapshot {
	if limit <= 0 || limit > 200 {
		limit = 60
	}

	return Snapshot{
		GeneratedAt: time.Now().UTC(),
		Sections: []Section{
			m.controlPlaneJournal(ctx, limit),
			m.accessLogSection(limit),
			m.fileSection("install-log", "Installer log", "file", "Recent installer output for build, package, and deploy activity.", "/var/log/aegis/install.log", limit),
		},
	}
}

func (m *Manager) accessLogSection(limit int) Section {
	const description = "Recent reverse-proxy access events written by the panel stack."

	candidates := []string{
		"/opt/kitebot/app/logs/nginx/access.log",
		"/var/log/nginx/access.log",
		"/var/log/aegis/caddy-access.log",
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return m.fileSection("access-log", "Access log", "file", description, path, limit)
		}
	}

	return Section{
		ID:          "access-log",
		Label:       "Access log",
		Kind:        "file",
		Description: description,
		Notice:      fmt.Sprintf("No reverse-proxy access log was found at %s", strings.Join(candidates, ", ")),
		Lines:       make([]Entry, 0),
	}
}

func (m *Manager) controlPlaneJournal(ctx context.Context, limit int) Section {
	section := Section{
		ID:          "control-plane",
		Label:       "Control plane journal",
		Kind:        "journal",
		Description: "Recent aegis-agent and aegis-ui systemd journal entries.",
		Lines:       make([]Entry, 0),
	}

	command := exec.CommandContext(ctx,
		"journalctl",
		"--no-pager",
		fmt.Sprintf("--lines=%d", limit),
		"--output=json",
		"--unit=aegis-agent.service",
		"--unit=aegis-ui.service",
	)
	out, err := command.Output()
	if err != nil {
		section.Notice = commandNotice(command, err)
		return section
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		entry, ok := parseJournalEntry(line)
		if ok {
			section.Lines = append(section.Lines, entry)
		}
	}

	if err := scanner.Err(); err != nil {
		section.Notice = fmt.Sprintf("journal scan failed: %v", err)
		section.Lines = make([]Entry, 0)
		return section
	}

	if len(section.Lines) == 0 {
		section.Notice = "No recent control-plane journal lines were returned."
	}

	return section
}

func (m *Manager) fileSection(id, label, kind, description, path string, limit int) Section {
	section := Section{
		ID:          id,
		Label:       label,
		Kind:        kind,
		Description: description,
		Lines:       make([]Entry, 0),
	}

	lines, err := tailLines(path, limit)
	if err != nil {
		section.Notice = err.Error()
		return section
	}

	for _, line := range lines {
		section.Lines = append(section.Lines, parseFileEntry(path, line))
	}

	if len(section.Lines) == 0 {
		section.Notice = "No lines were available for this source."
	}

	return section
}

func tailLines(path string, limit int) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%s is not present on this host", path)
		}
		return nil, fmt.Errorf("unable to open %s: %w", path, err)
	}
	defer file.Close()

	lines := make([]string, 0, limit)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text == "" {
			continue
		}
		if len(lines) == limit {
			copy(lines, lines[1:])
			lines[len(lines)-1] = text
			continue
		}
		lines = append(lines, text)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("unable to read %s: %w", path, err)
	}

	return lines, nil
}

func parseJournalEntry(raw string) (Entry, bool) {
	var payload struct {
		Timestamp  string `json:"__REALTIME_TIMESTAMP"`
		Unit       string `json:"_SYSTEMD_UNIT"`
		Identifier string `json:"SYSLOG_IDENTIFIER"`
		Priority   string `json:"PRIORITY"`
		Message    string `json:"MESSAGE"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return Entry{}, false
	}

	entry := Entry{
		Timestamp: formatJournalTimestamp(payload.Timestamp),
		Source:    nonEmpty(payload.Unit, payload.Identifier),
		Level:     journalPriorityLabel(payload.Priority),
		Summary:   strings.TrimSpace(payload.Message),
		Raw:       raw,
	}
	if entry.Summary == "" {
		entry.Summary = raw
	}
	return entry, true
}

func parseFileEntry(path, raw string) Entry {
	entry := Entry{Source: path, Summary: raw, Raw: raw}

	if strings.HasPrefix(raw, "[") {
		if end := strings.Index(raw, "]"); end > 1 {
			entry.Timestamp = strings.TrimSpace(raw[1:end])
			entry.Summary = strings.TrimSpace(raw[end+1:])
			if entry.Summary == "" {
				entry.Summary = raw
			}
			return entry
		}
	}

	if strings.HasPrefix(raw, "{") {
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err == nil {
			if ts, ok := payload["ts"].(string); ok && strings.TrimSpace(ts) != "" {
				entry.Timestamp = ts
			}
			if message, ok := payload["msg"].(string); ok && strings.TrimSpace(message) != "" {
				entry.Summary = message
			}
			if status, ok := payload["status"].(float64); ok {
				entry.Level = fmt.Sprintf("status %.0f", status)
			}
		}
	}

	return entry
}

func formatJournalTimestamp(value string) string {
	if value == "" {
		return ""
	}
	us, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return value
	}
	return time.Unix(0, us*int64(time.Microsecond)).UTC().Format(time.RFC3339)
}

func journalPriorityLabel(value string) string {
	switch strings.TrimSpace(value) {
	case "0":
		return "emerg"
	case "1":
		return "alert"
	case "2":
		return "crit"
	case "3":
		return "error"
	case "4":
		return "warn"
	case "5":
		return "notice"
	case "6":
		return "info"
	case "7":
		return "debug"
	default:
		return ""
	}
}

func commandNotice(command *exec.Cmd, err error) string {
	message := strings.TrimSpace(err.Error())
	if exitError, ok := err.(*exec.ExitError); ok {
		stderr := strings.TrimSpace(string(exitError.Stderr))
		if stderr != "" {
			message = stderr
		}
	}
	if message == "" {
		message = fmt.Sprintf("%s failed", strings.Join(command.Args, " "))
	}
	return message
}

func nonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}
