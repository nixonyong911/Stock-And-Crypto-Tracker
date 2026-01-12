// Package executor provides CLI command execution with context-based timeout
package executor

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
	"golang.org/x/sync/semaphore"

	"github.com/stocktracker/ai-hub2/internal/config"
)

// CLIResult holds the result of a CLI execution
type CLIResult struct {
	Success         bool
	Output          string
	Error           string
	ExitCode        int
	ExecutionTimeMs int64
}

// ExecuteParams contains parameters for CLI execution
type ExecuteParams struct {
	CLI         string // "claude" or "cursor-agent"
	Message     string
	ContextPath string
	Model       string
	SessionID   string // Optional: resume session (cursor-agent: --resume, claude: -r)
}

// CLIExecutor handles CLI command execution with concurrency limits
type CLIExecutor struct {
	config    *config.Config
	semaphore *semaphore.Weighted
	logger    zerolog.Logger
}

// New creates a new CLIExecutor with the specified concurrency limit
func New(cfg *config.Config, logger zerolog.Logger) *CLIExecutor {
	return &CLIExecutor{
		config:    cfg,
		semaphore: semaphore.NewWeighted(int64(cfg.MaxConcurrent)),
		logger:    logger.With().Str("component", "executor").Logger(),
	}
}

// Execute runs a CLI command with context-based timeout and concurrency control
func (e *CLIExecutor) Execute(ctx context.Context, params ExecuteParams) (*CLIResult, error) {
	startTime := time.Now()

	logEvent := e.logger.Info().
		Str("cli", params.CLI).
		Str("model", params.Model).
		Int("message_length", len(params.Message)).
		Int("timeout_seconds", e.config.CLITimeoutSeconds)
	if params.SessionID != "" {
		logEvent = logEvent.Str("session_id", params.SessionID)
	}
	logEvent.Msg("CLI execution starting")

	// Acquire semaphore (blocks if max concurrent reached)
	if err := e.semaphore.Acquire(ctx, 1); err != nil {
		return nil, fmt.Errorf("failed to acquire semaphore: %w", err)
	}
	defer e.semaphore.Release(1)

	e.logger.Debug().
		Str("cli", params.CLI).
		Int64("wait_ms", time.Since(startTime).Milliseconds()).
		Msg("Semaphore acquired")

	// Build the CLI command
	cliCommand := e.buildCLICommand(params)
	fullCommand := fmt.Sprintf(`cd "%s" && %s`, params.ContextPath, cliCommand)

	// Create context with timeout
	execCtx, cancel := context.WithTimeout(ctx, e.config.CLITimeout)
	defer cancel()

	// Execute command with process group for cleanup
	result, err := e.executeCommand(execCtx, fullCommand, startTime)
	if err != nil {
		e.logger.Error().
			Err(err).
			Str("cli", params.CLI).
			Str("model", params.Model).
			Int64("elapsed_ms", time.Since(startTime).Milliseconds()).
			Msg("CLI execution failed")
		return nil, err
	}

	result.ExecutionTimeMs = time.Since(startTime).Milliseconds()

	e.logger.Info().
		Str("cli", params.CLI).
		Str("model", params.Model).
		Bool("success", result.Success).
		Int("exit_code", result.ExitCode).
		Int("output_length", len(result.Output)).
		Int64("total_ms", result.ExecutionTimeMs).
		Msg("CLI execution completed")

	return result, nil
}

// CLICommandBuilder provides centralized command building for different CLIs
type CLICommandBuilder struct {
	// Common settings
	ClaudeMCPConfig string // Path to Claude MCP config file
}

// NewCLICommandBuilder creates a command builder with default settings
func NewCLICommandBuilder() *CLICommandBuilder {
	return &CLICommandBuilder{
		ClaudeMCPConfig: "/root/.claude-mcp.json",
	}
}

// escapeMessage escapes special shell characters in the message
func (b *CLICommandBuilder) escapeMessage(message string) string {
	escaped := strings.ReplaceAll(message, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	escaped = strings.ReplaceAll(escaped, `$`, `\$`)
	return escaped
}

// BuildClaudeCommand builds a Claude CLI command
// Format: echo "<message>" | claude --print --output-format text --mcp-config <config> [-r <session_id>]
func (b *CLICommandBuilder) BuildClaudeCommand(message, sessionID string) string {
	escapedMessage := b.escapeMessage(message)

	// Base command parts
	parts := []string{
		fmt.Sprintf(`echo "%s"`, escapedMessage),
		"|",
		"claude",
		"--print",
		"--output-format", "text",
		"--mcp-config", b.ClaudeMCPConfig,
	}

	// Optional: session resume flag
	if sessionID != "" {
		parts = append(parts, "-r", sessionID)
	}

	return strings.Join(parts, " ")
}

// BuildCursorAgentCommand builds a cursor-agent CLI command
// Format: cursor-agent -p "<message>" --model <model> --approve-mcps --force [--resume=<session_id>]
func (b *CLICommandBuilder) BuildCursorAgentCommand(message, model, sessionID string) string {
	escapedMessage := b.escapeMessage(message)

	// Base command parts
	parts := []string{
		"cursor-agent",
		"-p", fmt.Sprintf(`"%s"`, escapedMessage),
	}

	// Optional: model flag
	if model != "" {
		parts = append(parts, "--model", model)
	}

	// Standard flags
	parts = append(parts, "--approve-mcps", "--force")

	// Optional: session resume flag
	if sessionID != "" {
		parts = append(parts, fmt.Sprintf("--resume=%s", sessionID))
	}

	return strings.Join(parts, " ")
}

// buildCLICommand constructs the CLI command string (centralized entry point)
func (e *CLIExecutor) buildCLICommand(params ExecuteParams) string {
	builder := NewCLICommandBuilder()

	switch params.CLI {
	case "claude":
		return builder.BuildClaudeCommand(params.Message, params.SessionID)

	case "cursor-agent":
		return builder.BuildCursorAgentCommand(params.Message, params.Model, params.SessionID)

	default:
		return fmt.Sprintf(`echo "Unknown CLI: %s"`, params.CLI)
	}
}

// executeCommand runs the shell command with proper process group management
func (e *CLIExecutor) executeCommand(ctx context.Context, command string, startTime time.Time) (*CLIResult, error) {
	cmd := exec.CommandContext(ctx, "bash", "-c", command)

	// Create new process group for proper cleanup on timeout
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	e.logger.Debug().
		Int("command_length", len(command)).
		Msg("Starting subprocess")

	err := cmd.Start()
	if err != nil {
		return &CLIResult{
			Success:  false,
			Output:   "",
			Error:    fmt.Sprintf("Failed to start command: %v", err),
			ExitCode: -1,
		}, nil
	}

	e.logger.Debug().
		Int("pid", cmd.Process.Pid).
		Int64("elapsed_ms", time.Since(startTime).Milliseconds()).
		Msg("Process started")

	// Wait for completion
	err = cmd.Wait()

	// Check if context was cancelled (timeout)
	if ctx.Err() == context.DeadlineExceeded {
		// Kill the process group
		if cmd.Process != nil {
			pgid, err := syscall.Getpgid(cmd.Process.Pid)
			if err == nil {
				syscall.Kill(-pgid, syscall.SIGKILL)
			}
		}
		return &CLIResult{
			Success:  false,
			Output:   "",
			Error:    fmt.Sprintf("CLI execution timed out after %d seconds", e.config.CLITimeoutSeconds),
			ExitCode: -1,
		}, nil
	}

	output := stdout.String()
	errorOutput := stderr.String()

	// Clean ANSI escape codes from output
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	output = ansiRegex.ReplaceAllString(output, "")
	output = strings.TrimSpace(output)

	// Filter SSH warnings from stderr
	if errorOutput != "" {
		var filteredLines []string
		for _, line := range strings.Split(errorOutput, "\n") {
			lower := strings.ToLower(line)
			if !strings.Contains(lower, "warning:") &&
				!strings.Contains(lower, "known_hosts") &&
				!strings.Contains(lower, "permanently added") {
				filteredLines = append(filteredLines, line)
			}
		}
		errorOutput = strings.TrimSpace(strings.Join(filteredLines, "\n"))
	}

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	return &CLIResult{
		Success:  exitCode == 0,
		Output:   output,
		Error:    errorOutput,
		ExitCode: exitCode,
	}, nil
}

// CheckCLIAvailable verifies if a CLI tool is installed and accessible
func (e *CLIExecutor) CheckCLIAvailable(ctx context.Context, cli string) bool {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, cli, "--version")
	err := cmd.Run()
	return err == nil
}
