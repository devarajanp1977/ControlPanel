// internal/system/overview.go — lightweight host snapshotting for the dashboard and future metrics surfaces.
package system

import (
	"context"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

type Service struct{}

type Overview struct {
	GeneratedAt time.Time           `json:"generated_at"`
	Host        HostInfo            `json:"host"`
	CPU         CPUInfo             `json:"cpu"`
	Memory      MemoryInfo          `json:"memory"`
	Swap        MemoryInfo          `json:"swap"`
	Load        LoadInfo            `json:"load"`
	Mounts      []MountUsage        `json:"mounts"`
	Interfaces  []InterfaceCounters `json:"interfaces"`
}

type HostInfo struct {
	Hostname      string `json:"hostname"`
	Platform      string `json:"platform"`
	PlatformVers  string `json:"platform_version"`
	KernelVersion string `json:"kernel_version"`
	KernelArch    string `json:"kernel_arch"`
	UptimeSeconds uint64 `json:"uptime_seconds"`
	Virtualization string `json:"virtualization"`
}

type CPUInfo struct {
	Percent float64 `json:"percent"`
	Cores   int     `json:"cores"`
	Threads int     `json:"threads"`
}

type MemoryInfo struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Free        uint64  `json:"free"`
	UsedPercent float64 `json:"used_percent"`
}

type LoadInfo struct {
	One     float64 `json:"one"`
	Five    float64 `json:"five"`
	Fifteen float64 `json:"fifteen"`
}

type MountUsage struct {
	Path        string  `json:"path"`
	Filesystem  string  `json:"filesystem"`
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Free        uint64  `json:"free"`
	UsedPercent float64 `json:"used_percent"`
}

type InterfaceCounters struct {
	Name      string `json:"name"`
	BytesSent uint64 `json:"bytes_sent"`
	BytesRecv uint64 `json:"bytes_recv"`
}

func New() *Service { return &Service{} }

func (s *Service) Overview(ctx context.Context) (Overview, error) {
	overview := Overview{
		GeneratedAt: time.Now().UTC(),
		Mounts:      make([]MountUsage, 0),
		Interfaces:  make([]InterfaceCounters, 0),
	}

	hostInfo, err := host.InfoWithContext(ctx)
	if err == nil {
		overview.Host = HostInfo{
			Hostname:       hostInfo.Hostname,
			Platform:       hostInfo.Platform,
			PlatformVers:   hostInfo.PlatformVersion,
			KernelVersion:  hostInfo.KernelVersion,
			KernelArch:     hostInfo.KernelArch,
			UptimeSeconds:  hostInfo.Uptime,
			Virtualization: hostInfo.VirtualizationSystem,
		}
	}

	logical, err := cpu.CountsWithContext(ctx, true)
	if err == nil {
		overview.CPU.Threads = logical
	}
	physical, err := cpu.CountsWithContext(ctx, false)
	if err == nil {
		overview.CPU.Cores = physical
	}
	percents, err := cpu.PercentWithContext(ctx, 0, false)
	if err == nil && len(percents) > 0 {
		overview.CPU.Percent = percents[0]
	}

	virtualMemory, err := mem.VirtualMemoryWithContext(ctx)
	if err == nil {
		overview.Memory = MemoryInfo{
			Total:       virtualMemory.Total,
			Used:        virtualMemory.Used,
			Free:        virtualMemory.Available,
			UsedPercent: virtualMemory.UsedPercent,
		}
	}
	swapMemory, err := mem.SwapMemoryWithContext(ctx)
	if err == nil {
		overview.Swap = MemoryInfo{
			Total:       swapMemory.Total,
			Used:        swapMemory.Used,
			Free:        swapMemory.Free,
			UsedPercent: swapMemory.UsedPercent,
		}
	}

	loadAvg, err := load.AvgWithContext(ctx)
	if err == nil {
		overview.Load = LoadInfo{One: loadAvg.Load1, Five: loadAvg.Load5, Fifteen: loadAvg.Load15}
	}

	partitions, err := disk.PartitionsWithContext(ctx, false)
	if err == nil {
		for _, partition := range partitions {
			usage, usageErr := disk.UsageWithContext(ctx, partition.Mountpoint)
			if usageErr != nil {
				continue
			}
			overview.Mounts = append(overview.Mounts, MountUsage{
				Path:        partition.Mountpoint,
				Filesystem:  partition.Fstype,
				Total:       usage.Total,
				Used:        usage.Used,
				Free:        usage.Free,
				UsedPercent: usage.UsedPercent,
			})
		}
	}

	interfaces, err := net.IOCountersWithContext(ctx, true)
	if err == nil {
		for _, nic := range interfaces {
			overview.Interfaces = append(overview.Interfaces, InterfaceCounters{
				Name:      nic.Name,
				BytesSent: nic.BytesSent,
				BytesRecv: nic.BytesRecv,
			})
		}
	}

	return overview, nil
}