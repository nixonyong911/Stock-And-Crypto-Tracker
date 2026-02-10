package cli

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
)

// ExecuteParams contains parameters for CLI execution
type ExecuteParams struct {
	CLI         string
	Message     string
	ContextPath string
	Model       string
	SessionID   string
	Tier        config.Tier
	HomePath    string
	Timeout     time.Duration
}

// Result holds the result of a CLI execution
type Result struct {
	Success         bool
	Output          string
	Error           string
	SessionID       string
	ExitCode        int
	ExecutionTimeMs int64
}

// Executor handles CLI command execution
type Executor struct {
	config *config.Config
	logger zerolog.Logger
}

// NewExecutor creates a new CLI executor
func NewExecutor(cfg *config.Config, logger zerolog.Logger) *Executor {
	return &Executor{
		config: cfg,
		logger: logger.With().Str("component", "cli-executor").Logger(),
	}
}

// Execute runs a CLI command with timeout and process group management
func (e *Executor) Execute(ctx context.Context, params ExecuteParams) (*Result, error) {
	startTime := time.Now()

	e.logger.Info().
		Str("cli", params.CLI).
		Str("model", params.Model).
		Str("tier", string(params.Tier)).
		Int("message_length", len(params.Message)).
		Msg("CLI execution starting")

	// Build command arguments (no shell interpolation)
	args := e.buildArgs(params)

	// Create context with per-tier timeout
	execCtx, cancel := context.WithTimeout(ctx, params.Timeout)
	defer cancel()

	// Create command — use exec.Command with args array (hardened, no bash -c)
	cmd := exec.CommandContext(execCtx, args[0], args[1:]...)
	cmd.Dir = params.ContextPath

	// Set HOME for tier-based MCP config
	cmd.Env = append(cmd.Environ(),
		fmt.Sprintf("HOME=%s", params.HomePath),
	)

	// Create new process group for cleanup
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return &Result{
			Success:  false,
			Error:    fmt.Sprintf("Failed to start: %v", err),
			ExitCode: -1,
		}, nil
	}

	e.logger.Debug().Int("pid", cmd.Process.Pid).Msg("Process started")

	// Wait for completion
	err := cmd.Wait()

	// Handle timeout
	if execCtx.Err() == context.DeadlineExceeded {
		if cmd.Process != nil {
			pgid, pgErr := syscall.Getpgid(cmd.Process.Pid)
			if pgErr == nil {
				_ = syscall.Kill(-pgid, syscall.SIGKILL)
			}
		}
		return &Result{
			Success:  false,
			Error:    fmt.Sprintf("CLI timed out after %v", params.Timeout),
			ExitCode: -1,
		}, nil
	}

	output := e.cleanOutput(stdout.String())
	errorOutput := e.cleanStderr(stderr.String())

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	result := &Result{
		Success:         exitCode == 0,
		Output:          output,
		Error:           errorOutput,
		ExitCode:        exitCode,
		ExecutionTimeMs: time.Since(startTime).Milliseconds(),
	}

	e.logger.Info().
		Str("cli", params.CLI).
		Bool("success", result.Success).
		Int("exit_code", exitCode).
		Int64("total_ms", result.ExecutionTimeMs).
		Msg("CLI execution completed")

	return result, nil
}

// buildArgs constructs command arguments without shell interpolation
func (e *Executor) buildArgs(params ExecuteParams) []string {
	switch params.CLI {
	case "cursor-agent":
		args := []string{
			"cursor-agent",
			"-p", params.Message,
			"--approve-mcps", "--force",
		}
		if params.Model != "" {
			args = append(args, "--model", params.Model)
		}
		if params.SessionID != "" {
			args = append(args, fmt.Sprintf("--resume=%s", params.SessionID))
		}
		return args

	case "claude":
		args := []string{
			"claude",
			"--print",
			"--output-format", "text",
			"--message", params.Message,
		}
		if params.SessionID != "" {
			args = append(args, "-r", params.SessionID)
		}
		return args

	default:
		return []string{"echo", "Unknown CLI: " + params.CLI}
	}
}

// cleanOutput removes ANSI codes and trims whitespace
func (e *Executor) cleanOutput(output string) string {
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	cleaned := ansiRegex.ReplaceAllString(output, "")
	return strings.TrimSpace(cleaned)
}

// cleanStderr filters noise from stderr
func (e *Executor) cleanStderr(stderr string) string {
	if stderr == "" {
		return ""
	}
	var filtered []string
	for _, line := range strings.Split(stderr, "\n") {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "warning:") &&
			!strings.Contains(lower, "known_hosts") &&
			!strings.Contains(lower, "permanently added") {
			filtered = append(filtered, line)
		}
	}
	return strings.TrimSpace(strings.Join(filtered, "\n"))
}

// CheckCLIAvailable verifies if a CLI tool is accessible
func (e *Executor) CheckCLIAvailable(ctx context.Context, cli string) bool {
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(checkCtx, cli, "--version")
	return cmd.Run() == nil
}
