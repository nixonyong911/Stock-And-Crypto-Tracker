"""
CLI Executor Service

Executes AI CLI tools (claude, cursor-agent) using a prefix pattern:
- Production (prefix empty): Direct execution on host
- Local dev (prefix = SSH cmd): Execute via SSH to VM

The prefix is configured via AI_HUB_CLI_PREFIX environment variable.

Process Management:
- Uses aggressive process tree killing on timeout
- Includes background cleanup of orphaned cursor-agent processes
- Prevents zombie processes from blocking new requests
"""

import asyncio
import os
import re
import shlex
import signal
import time
from dataclasses import dataclass
from typing import Optional, List, Set
from asyncio.subprocess import PIPE

import structlog

from config import get_config

logger = structlog.get_logger(__name__)


def _get_child_pids(parent_pid: int) -> List[int]:
    """Get all child PIDs of a process recursively using /proc filesystem."""
    children = []
    try:
        # Read /proc to find children (Linux-specific)
        for entry in os.listdir('/proc'):
            if not entry.isdigit():
                continue
            try:
                with open(f'/proc/{entry}/stat', 'r') as f:
                    stat = f.read().split()
                    # stat[3] is the parent PID
                    if len(stat) > 3 and int(stat[3]) == parent_pid:
                        child_pid = int(entry)
                        children.append(child_pid)
                        # Recursively get grandchildren
                        children.extend(_get_child_pids(child_pid))
            except (FileNotFoundError, PermissionError, ValueError, IndexError):
                continue
    except FileNotFoundError:
        # /proc doesn't exist (non-Linux)
        pass
    return children


def _kill_process_tree(pid: int) -> int:
    """
    Kill a process and all its descendants.
    
    Returns the number of processes killed.
    """
    killed_count = 0
    
    # First, get all child PIDs before killing (they might disappear after parent dies)
    all_pids = _get_child_pids(pid)
    all_pids.append(pid)  # Include the parent
    
    # Kill all processes, starting with children (bottom-up is safer)
    for target_pid in reversed(all_pids):
        try:
            os.kill(target_pid, signal.SIGKILL)
            killed_count += 1
            logger.debug("cli_process_killed", pid=target_pid)
        except (OSError, ProcessLookupError):
            # Process already dead
            pass
    
    return killed_count


async def kill_orphaned_cursor_agents(max_age_seconds: int = 300) -> int:
    """
    Kill any orphaned cursor-agent processes that have been running too long.
    
    This is a safety net for processes that escape normal cleanup.
    
    Args:
        max_age_seconds: Kill processes older than this (default: 5 minutes)
        
    Returns:
        Number of processes killed
    """
    killed_count = 0
    current_time = time.time()
    
    try:
        for entry in os.listdir('/proc'):
            if not entry.isdigit():
                continue
            
            pid = int(entry)
            
            try:
                # Read command line
                with open(f'/proc/{pid}/cmdline', 'r') as f:
                    cmdline = f.read().replace('\0', ' ')
                
                # Check if it's a cursor-agent process (but not worker-server, which is needed)
                if 'cursor-agent' in cmdline and 'worker-server' not in cmdline:
                    # Check process age
                    stat = os.stat(f'/proc/{pid}')
                    process_age = current_time - stat.st_ctime
                    
                    if process_age > max_age_seconds:
                        logger.warning(
                            "cli_killing_orphan",
                            pid=pid,
                            age_seconds=int(process_age),
                            cmdline=cmdline[:100]
                        )
                        killed_count += _kill_process_tree(pid)
                        
            except (FileNotFoundError, PermissionError, ValueError):
                continue
                
    except FileNotFoundError:
        # /proc doesn't exist (non-Linux)
        logger.debug("cli_orphan_cleanup_skipped", reason="not_linux")
        
    if killed_count > 0:
        logger.info("cli_orphans_cleaned", killed_count=killed_count)
        
    return killed_count


@dataclass
class CLIResult:
    """Result from CLI execution."""
    success: bool
    output: str
    error: Optional[str] = None
    exit_code: int = 0
    execution_time_ms: int = 0


class CLIExecutor:
    """
    Executes AI CLI commands using prefix pattern.
    
    The AI_HUB_CLI_PREFIX determines how commands are executed:
    - Empty (production): Commands run directly on host
    - SSH command (local): Commands run via SSH to VM
    
    Example:
        prefix = "ssh -i key.pem user@host"
        command = 'cd /home/azureuser/stock-tracker && echo "hello" | cursor-agent --print'
        
        Final: ssh -i key.pem user@host 'cd /home/azureuser/stock-tracker && echo "hello" | cursor-agent --print'
    """
    
    def __init__(self):
        self.config = get_config()
        self.settings = self.config.settings
        self.cli_prefix = self.settings.ai_hub_cli_prefix.strip()
        self.default_context_path = self.settings.ai_hub_default_context_path
        self.timeout = self.settings.ai_hub_cli_timeout_seconds
    
    async def execute(
        self,
        cli: str,
        message: str,
        context_path: Optional[str] = None,
        model: Optional[str] = None,
        output_format: str = "text"
    ) -> CLIResult:
        """
        Execute a CLI command.
        
        Args:
            cli: CLI to use ('claude' or 'cursor-agent')
            message: The prompt/message to send
            context_path: Override context path (default: /home/azureuser/stock-tracker)
            model: Model variant to use (e.g., 'opus-4.5', 'sonnet-4')
            output_format: Output format ('text' or 'json')
        
        Returns:
            CLIResult with output or error
        """
        start_time = time.time()
        
        # Log CLI start
        logger.info(
            "cli_start",
            cli=cli,
            model=model,
            timeout_seconds=self.timeout,
            message_length=len(message)
        )
        
        path = context_path or self.default_context_path
        
        # Build the CLI command
        cli_command = self._build_cli_command(cli, message, output_format, model)
        
        # Build full command with context path
        command = f'cd "{path}" && {cli_command}'
        
        # Apply prefix if configured (for SSH in local dev)
        if self.cli_prefix:
            # Escape the command for SSH
            escaped_command = shlex.quote(command)
            full_command = f'{self.cli_prefix} {escaped_command}'
        else:
            full_command = command
        
        try:
            result = await self._execute_command(full_command, start_time)
            result.execution_time_ms = int((time.time() - start_time) * 1000)
            
            # Log CLI complete
            logger.info(
                "cli_complete",
                cli=cli,
                model=model,
                success=result.success,
                exit_code=result.exit_code,
                output_length=len(result.output),
                total_ms=result.execution_time_ms
            )
            return result
            
        except asyncio.TimeoutError:
            elapsed_ms = int((time.time() - start_time) * 1000)
            # Log CLI timeout
            logger.error(
                "cli_timeout",
                cli=cli,
                model=model,
                timeout_seconds=self.timeout,
                elapsed_ms=elapsed_ms,
                stage="waiting_output"
            )
            return CLIResult(
                success=False,
                output="",
                error=f"CLI execution timed out after {self.timeout} seconds",
                exit_code=-1,
                execution_time_ms=elapsed_ms
            )
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            # Log CLI error
            logger.error(
                "cli_error",
                cli=cli,
                model=model,
                error=str(e),
                elapsed_ms=elapsed_ms
            )
            return CLIResult(
                success=False,
                output="",
                error=str(e),
                exit_code=-1,
                execution_time_ms=elapsed_ms
            )
    
    def _build_cli_command(
        self, 
        cli: str, 
        message: str, 
        output_format: str,
        model: Optional[str] = None
    ) -> str:
        """
        Build the CLI command string with piped input for non-interactive mode.
        
        Both claude and cursor-agent use --print flag for headless/script mode,
        with the prompt piped via stdin (not as positional argument).
        
        cursor-agent flags:
        - --print: non-interactive mode (required for scripts)
        - --approve-mcps: auto-approve MCP servers in headless mode
        - --force: allow tool execution without explicit confirmation
        """
        # Escape for shell: backslash, double quotes, and dollar signs
        escaped_message = message.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$')
        
        if cli == "claude":
            # Claude Code CLI: pipe message to stdin with --print for non-interactive
            # --mcp-config loads MCP servers in headless mode (required for --print)
            mcp_config = '/root/.claude-mcp.json'
            return f'echo "{escaped_message}" | claude --print --output-format {output_format} --mcp-config {mcp_config}'
        elif cli == "cursor-agent":
            # cursor-agent: use -p flag for prompt (cleaner than echo pipe)
            model_flag = f"--model {model}" if model else ""
            return f'cursor-agent -p "{escaped_message}" {model_flag} --approve-mcps --force'
        else:
            raise ValueError(f"Unknown CLI: {cli}. Supported: claude, cursor-agent")
    
    async def _execute_command(self, command: str, start_time: float) -> CLIResult:
        """Execute a shell command.
        
        Uses start_new_session=True to create a new process group.
        On timeout, kills entire process tree aggressively.
        """
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=PIPE,
            stderr=PIPE,
            start_new_session=True  # Create new process group for easier cleanup
        )
        
        # Log process spawned
        spawn_elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "cli_process_spawned",
            pid=process.pid,
            elapsed_ms=spawn_elapsed_ms,
            command_length=len(command)
        )
        
        try:
            # Log waiting for output
            logger.info(
                "cli_waiting_output",
                pid=process.pid,
                elapsed_ms=int((time.time() - start_time) * 1000),
                timeout_seconds=self.timeout
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout
            )
            
            # Log output received
            output_elapsed_ms = int((time.time() - start_time) * 1000)
            logger.info(
                "cli_output_received",
                pid=process.pid,
                elapsed_ms=output_elapsed_ms,
                exit_code=process.returncode,
                stdout_length=len(stdout),
                stderr_length=len(stderr)
            )
            
            output = stdout.decode('utf-8', errors='replace').strip()
            error = stderr.decode('utf-8', errors='replace').strip()
            
            # Filter out common SSH warnings and ANSI escape codes from stderr
            if error:
                error_lines = [
                    line for line in error.split('\n')
                    if not any(skip in line.lower() for skip in [
                        'warning:', 'known_hosts', 'permanently added'
                    ])
                ]
                error = '\n'.join(error_lines).strip()
            
            # Clean ANSI escape codes from output (cursor-agent may emit them)
            output = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', output)
            
            return CLIResult(
                success=process.returncode == 0,
                output=output,
                error=error if error else None,
                exit_code=process.returncode or 0
            )
        except asyncio.TimeoutError:
            # Aggressively kill entire process tree
            killed_count = _kill_process_tree(process.pid)
            
            # Also try killing the process group as backup
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (OSError, ProcessLookupError):
                pass
            
            # Final fallback: direct kill
            try:
                process.kill()
            except ProcessLookupError:
                pass
            
            logger.warning(
                "cli_timeout_cleanup",
                pid=process.pid,
                killed_count=killed_count
            )
            
            raise
    
    async def check_cli_available(self, cli: str) -> bool:
        """Check if a CLI is available/installed."""
        try:
            command = f"{cli} --version"
            
            if self.cli_prefix:
                command = f'{self.cli_prefix} {shlex.quote(command)}'
            
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=PIPE,
                stderr=PIPE
            )
            await asyncio.wait_for(process.communicate(), timeout=10)
            return process.returncode == 0
        except:
            return False
    
    def get_execution_mode(self) -> str:
        """Return description of current execution mode."""
        if self.cli_prefix:
            return f"SSH via prefix: {self.cli_prefix[:50]}..."
        return "Direct execution on host"


# Global executor instance
_executor: Optional[CLIExecutor] = None


def get_cli_executor() -> CLIExecutor:
    """Get or create the global CLI executor instance."""
    global _executor
    if _executor is None:
        _executor = CLIExecutor()
    return _executor
