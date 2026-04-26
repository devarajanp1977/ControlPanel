// internal/services/services.go — systemd service listing and actions power the first real service-management surface.
package services

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"sort"
	"strings"
)

var validUnitName = regexp.MustCompile(`^[a-zA-Z0-9@._-]+\.service$`)
var validActions = map[string]struct{}{
	"start":   {},
	"stop":    {},
	"restart": {},
	"reload":  {},
}

type Manager struct{}

type Unit struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	LoadState     string `json:"load_state"`
	ActiveState   string `json:"active_state"`
	SubState      string `json:"sub_state"`
	UnitFileState string `json:"unit_file_state"`
}

func New() *Manager { return &Manager{} }

func (m *Manager) List(ctx context.Context) ([]Unit, error) {
	cmd := exec.CommandContext(ctx, "systemctl", "show", "--type=service", "--all", "--property=Id,Description,LoadState,ActiveState,SubState,UnitFileState", "--no-pager")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var units []Unit
	current := Unit{}
	for _, rawLine := range strings.Split(string(output), "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			if current.Name != "" {
				units = append(units, current)
				current = Unit{}
			}
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch key {
		case "Id":
			current.Name = value
		case "Description":
			current.Description = value
		case "LoadState":
			current.LoadState = value
		case "ActiveState":
			current.ActiveState = value
		case "SubState":
			current.SubState = value
		case "UnitFileState":
			current.UnitFileState = value
		}
	}
	if current.Name != "" {
		units = append(units, current)
	}
	sort.Slice(units, func(i, j int) bool {
		return units[i].Name < units[j].Name
	})
	return units, nil
}

func (m *Manager) Action(ctx context.Context, unitName, action string) error {
	unitName = strings.TrimSpace(unitName)
	action = strings.TrimSpace(strings.ToLower(action))
	if !validUnitName.MatchString(unitName) {
		return fmt.Errorf("invalid service unit %q", unitName)
	}
	if _, ok := validActions[action]; !ok {
		return fmt.Errorf("invalid service action %q", action)
	}
	cmd := exec.CommandContext(ctx, "sudo", "-n", "systemctl", action, unitName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("systemctl %s %s failed: %s", action, unitName, message)
	}
	return nil
}